"""
Sync worker tests - pulling Firestore into the local mirror on a
background timer.

Covers yard/docs/offline-sync-test.md section B5 (tests #31-33). Firestore
is faked; firebase-admin is never imported.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import mission_store  # noqa: E402
import sync_worker  # noqa: E402


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    monkeypatch.setattr(mission_store, 'DB_PATH', str(tmp_path / 'missions.db'))
    mission_store.init_db()


class FakeStreamDoc:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data

    def to_dict(self):
        return dict(self._data)


class FakeQueryCollection:
    def __init__(self, docs):
        self._docs = docs

    def order_by(self, field, direction=None):
        return self

    def limit(self, n):
        return self

    def stream(self):
        return list(self._docs)


class FakeFirestore:
    def __init__(self, docs):
        self._docs = docs

    def collection(self, name):
        return FakeQueryCollection(self._docs)


class BrokenFirestore:
    """Simulates no internet: any Firestore call raises."""

    def collection(self, name):
        raise RuntimeError('offline')


def test_sync_from_firestore_populates_the_mirror():
    docs = [FakeStreamDoc('q1', {'status': 'queued', 'submittedAt': '2026-07-14T08:00:00Z'})]
    sync_worker.sync_from_firestore(FakeFirestore(docs))

    missions, last_synced = mission_store.get_missions()
    assert {m['id'] for m in missions} == {'q1'}
    assert last_synced is not None


def test_sync_from_firestore_survives_a_firestore_error():
    sync_worker.sync_from_firestore(BrokenFirestore())  # must not raise

    missions, last_synced = mission_store.get_missions()
    assert missions == []
    assert last_synced is None


def test_start_sync_worker_reschedules_itself(monkeypatch):
    monkeypatch.setattr(sync_worker, 'sync_from_firestore', lambda client, **k: None)

    scheduled = []

    class FakeTimer:
        def __init__(self, interval, fn):
            scheduled.append(interval)
            self.daemon = None

        def start(self):
            pass

    monkeypatch.setattr(sync_worker.threading, 'Timer', FakeTimer)

    sync_worker.start_sync_worker(object(), interval=15)

    assert scheduled == [15]
