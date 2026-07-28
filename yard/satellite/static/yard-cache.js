/**
 * YardCache — two-tier offline cache + polling helper.
 *
 * Tier 1 (localStorage): synchronous, used for instant first paint from cache.
 * Tier 2 (IndexedDB): async, durable — survives localStorage being cleared/full.
 *
 * API:
 *   YardCache.read(key)        -> {value, ts} | null   (sync, tier 1)
 *   YardCache.write(key, val)  -> {value, ts}           (writes both tiers)
 *   YardCache.readDurable(key) -> Promise<{value, ts} | null>  (tier 2)
 *   YardCache.createPoller({ interval, maxInterval, fetchFn, onError, onOnline, onOffline })
 *     -> { refreshNow() }
 */
(function (global) {
    'use strict';

    var LS_PREFIX = 'yardcache:';
    var DB_NAME = 'yard-cache';
    var DB_VERSION = 1;
    var STORE_NAME = 'kv';

    var dbPromise = null;

    function openDb() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve) {
            if (!('indexedDB' in global)) { resolve(null); return; }
            var req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function () {
                var db = req.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { resolve(null); };
        });
        return dbPromise;
    }

    function idbWrite(key, entry) {
        openDb().then(function (db) {
            if (!db) return;
            try {
                db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(entry, key);
            } catch (e) { /* best-effort */ }
        });
    }

    function idbRead(key) {
        return openDb().then(function (db) {
            if (!db) return null;
            return new Promise(function (resolve) {
                try {
                    var req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
                    req.onsuccess = function () { resolve(req.result || null); };
                    req.onerror = function () { resolve(null); };
                } catch (e) { resolve(null); }
            });
        });
    }

    function lsRead(key) {
        try {
            var raw = localStorage.getItem(LS_PREFIX + key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function lsWrite(key, entry) {
        try {
            localStorage.setItem(LS_PREFIX + key, JSON.stringify(entry));
        } catch (e) { /* quota exceeded / unavailable — IndexedDB tier still gets it */ }
    }

    var YardCache = {
        read: function (key) {
            return lsRead(key);
        },

        write: function (key, value) {
            var entry = { value: value, ts: Date.now() };
            lsWrite(key, entry);
            idbWrite(key, entry);
            return entry;
        },

        readDurable: function (key) {
            return idbRead(key);
        },

        createPoller: function (opts) {
            opts = opts || {};
            var interval = opts.interval || 15000;
            var maxInterval = opts.maxInterval || interval;
            var fetchFn = opts.fetchFn || function () {};
            var onError = opts.onError || function () {};
            var onOnline = opts.onOnline || function () {};
            var onOffline = opts.onOffline || function () {};

            var timer = null;
            var currentDelay = interval;
            var running = false;
            var wasOffline = !navigator.onLine;

            function schedule(delay) {
                if (timer) clearTimeout(timer);
                timer = setTimeout(tick, delay);
            }

            function tick() {
                if (running) return;
                running = true;
                Promise.resolve()
                    .then(fetchFn)
                    .then(function () { currentDelay = interval; })
                    .catch(function (err) {
                        currentDelay = Math.min(currentDelay * 2, maxInterval);
                        onError(err);
                    })
                    .then(function () {
                        running = false;
                        schedule(currentDelay);
                    });
            }

            function refreshNow() {
                if (timer) clearTimeout(timer);
                return tick();
            }

            global.addEventListener('online', function () {
                if (wasOffline) { wasOffline = false; onOnline(); refreshNow(); }
            });
            global.addEventListener('offline', function () {
                wasOffline = true;
                onOffline();
            });

            tick(); // kick off immediately

            return { refreshNow: refreshNow };
        }
    };

    global.YardCache = YardCache;
})(window);