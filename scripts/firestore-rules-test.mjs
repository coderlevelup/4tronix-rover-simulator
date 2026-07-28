// Exercises firestore.rules against the emulator over the REST API.
// Seeds with `Authorization: Bearer owner` (bypasses rules), then attempts each
// operation with no auth header, which is exactly what a browser is.
const P = 'demo-rules-test';
const HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
const BASE = `http://${HOST}/v1/projects/${P}/databases/(default)/documents`;

const asOwner = { 'Authorization': 'Bearer owner', 'Content-Type': 'application/json' };
const asClient = { 'Content-Type': 'application/json' };

const S = (v) => ({ stringValue: v });

async function seed(path, fields) {
  const r = await fetch(`${BASE}/${path}`, {
    method: 'PATCH', headers: asOwner, body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`seed ${path} failed: ${r.status} ${await r.text()}`);
}

async function attempt(method, path, { body, mask } = {}) {
  let url = `${BASE}/${path}`;
  if (mask) url += `?` + mask.map((f) => `updateMask.fieldPaths=${f}`).join('&');
  const r = await fetch(url, {
    method, headers: asClient,
    body: body ? JSON.stringify({ fields: body }) : undefined,
  });
  return r.status;
}

const results = [];
function check(label, status, want) {
  const allowed = status >= 200 && status < 300;
  const ok = want === 'ALLOW' ? allowed : !allowed;
  results.push({ label, want, got: allowed ? 'ALLOW' : `DENY(${status})`, ok });
}

// --- seed -------------------------------------------------------------------
const HASH = 'b'.repeat(64);
const OTHER_HASH = 'c'.repeat(64);
await seed('missions/m_no_email', { name: S('Blank'), code: S('forward(50)'), status: S('queued') });
await seed('missions/m_has_email', { name: S('Taken'), code: S('forward(50)'), status: S('queued'), learnerEmailHash: S(HASH) });
await seed('missions/m_no_email2', { name: S('Blank2'), code: S('forward(50)'), status: S('queued') });
await seed('learners/L1', { learnerEmail: S('a@b.com'), displayName: S('Ada') });

// --- missions ---------------------------------------------------------------
check('mission: public read (feed)', await attempt('GET', 'missions/m_no_email'), 'ALLOW');
check('mission: list (feed query)', await attempt('GET', 'missions'), 'ALLOW');
check('mission: delete blocked', await attempt('DELETE', 'missions/m_no_email'), 'DENY');
check('mission: create blocked', await attempt('POST', 'missions?documentId=m_new', { name: S('x') }), 'DENY');
// updateDoc() in the web SDK always sends an updateMask; a maskless PATCH
// would replace the whole document, which is not what the app ever does.
check('mission: backfill hash into blank', await attempt('PATCH', 'missions/m_no_email', { body: { learnerEmailHash: S(HASH) }, mask: ['learnerEmailHash'] }), 'ALLOW');
check('mission: overwrite existing hash blocked', await attempt('PATCH', 'missions/m_has_email', { body: { learnerEmailHash: S(OTHER_HASH) }, mask: ['learnerEmailHash'] }), 'DENY');
check('mission: plaintext address as hash blocked', await attempt('PATCH', 'missions/m_no_email2', { body: { learnerEmailHash: S('ada@school.edu') }, mask: ['learnerEmailHash'] }), 'DENY');
check('mission: plaintext learnerEmail field blocked', await attempt('PATCH', 'missions/m_no_email2', { body: { learnerEmail: S('ada@school.edu') }, mask: ['learnerEmail'] }), 'DENY');
check('mission: tamper with code blocked', await attempt('PATCH', 'missions/m_has_email', { body: { code: S('import os') }, mask: ['code'] }), 'DENY');
check('mission: tamper with status blocked', await attempt('PATCH', 'missions/m_no_email', { body: { status: S('completed') }, mask: ['status'] }), 'DENY');

// --- learners ---------------------------------------------------------------
check('learner: get own doc by id', await attempt('GET', 'learners/L1'), 'ALLOW');
check('learner: LIST (enumerate all emails) blocked', await attempt('GET', 'learners'), 'DENY');
check('learner: delete blocked', await attempt('DELETE', 'learners/L1'), 'DENY');
check('learner: update email allowed', await attempt('PATCH', 'learners/L1', { body: { learnerEmail: S('c@d.com') }, mask: ['learnerEmail'] }), 'ALLOW');
check('learner: update displayName allowed', await attempt('PATCH', 'learners/L1', { body: { displayName: S('Grace') }, mask: ['displayName'] }), 'ALLOW');
check('learner: arbitrary field blocked', await attempt('PATCH', 'learners/L1', { body: { junk: S('payload') }, mask: ['junk'] }), 'DENY');

// --- unmatched collections --------------------------------------------------
check('unknown collection: write blocked', await attempt('PATCH', 'anything/x', { body: { a: S('b') }, mask: ['a'] }), 'DENY');
check('users: write blocked', await attempt('PATCH', 'users/u1', { body: { role: S('operator') }, mask: ['role'] }), 'DENY');

const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
console.log('\n' + pad('CHECK', 46) + pad('WANT', 8) + 'GOT');
console.log('-'.repeat(74));
for (const r of results) {
  console.log((r.ok ? '  ' : 'XX') + ' ' + pad(r.label, 43) + pad(r.want, 8) + r.got);
}
const failed = results.filter((r) => !r.ok);
console.log('-'.repeat(74));
console.log(`${results.length - failed.length}/${results.length} as intended`);
if (failed.length) { console.log('FAILURES: ' + failed.map((f) => f.label).join('; ')); process.exit(1); }
