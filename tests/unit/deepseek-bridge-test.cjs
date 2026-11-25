const test = require('node:test');
const assert = require('node:assert/strict');
const { createBridge, prepareSources } = require('../../scripts/deepseek-bridge-core.cjs');
const { load } = require('../support/run.cjs');
const { executeRoutine } = load('agent-routines');
const { readRoutineHistory, isAiWeeklyDraft } = load('routine-history');
const quote = '2026.11.24 캠페인 제안서를 검토했습니다';
const input = { routineId: 'weekly', items: [{ id: 'test-1', title: '테스트 고객사', sample: true, evidence: [quote] }] };
const good = { summary: [{ text: '없는 성과를 만들어낸 요약', sourceIds: ['test-1'], evidenceQuote: quote }], priorities: [], nextActions: [], needsVerification: [] };
const models = { data: [{ id: 'deepseek-weekly', type: 'llm', state: 'loaded', loaded_context_length: 4096 }] };
const response = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

async function start(t, request, options = {}) {
  const { server } = createBridge({ token: 'test-secret-only', request, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const send = (path = '/generate', body = input, headers = {}) => fetch(url + path, { method: body === null ? 'GET' : 'POST', headers: { Origin: 'http://localhost:3000', Authorization: 'Bearer test-secret-only', 'Content-Type': 'application/json', ...headers }, ...(body === null ? {} : { body: JSON.stringify(body) }) });
  send.url = url;
  return send;
}

test('untrusted origins, hosts and wrong codes never call LM Studio', async t => {
  let calls = 0;
  const send = await start(t, () => { calls++; throw Error('must not call'); });
  assert.equal((await send('/status', null, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await send('/status', null, { Authorization: 'Bearer wrong' })).status, 401);
  const blocked = await new Promise((resolve, reject) => {
    require('node:http').get(send.url + '/status', { headers: { Host: 'rebinding.example:4743', Origin: 'http://localhost:3000', Authorization: 'Bearer test-secret-only' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(blocked, 403);
  assert.equal(calls, 0);
});

test('null records and duplicate IDs return 400 before model requests', async t => {
  const send = await start(t, () => { throw Error('must not call'); });
  assert.equal((await send('/generate', { ...input, items: [null] })).status, 400);
  assert.equal((await send('/generate', { ...input, items: [...input.items, ...input.items] })).status, 400);
});

test('only verified source excerpts are displayed; unsupported statements are flagged', async t => {
  let submitted;
  const send = await start(t, async (url, options) => {
    if (url.endsWith('/models')) return response(models);
    submitted = JSON.parse(options.body);
    return response({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ ...good, priorities: [{ text: '허위 신규 계약', sourceIds: ['missing'], evidenceQuote: quote }] }) } }] });
  });
  const result = await send();
  assert.equal(result.status, 200);
  const draft = await result.json();
  assert.equal(draft.summary[0].text, `테스트 고객사: ${quote}`);
  assert.deepEqual(draft.needsVerification, ['허위 신규 계약']);
  assert.ok(isAiWeeklyDraft(draft));
  assert.equal(JSON.parse(submitted.messages[1].content).sources[0].sample, true);
  assert.equal(draft.coverage.includedSources, 1);
});

test('unloaded model, invalid JSON and truncated answers remain errors', async t => {
  const missing = await start(t, async () => response({ data: [] }));
  assert.equal((await missing('/status', null)).status, 503);
  const truncated = await start(t, async url => url.endsWith('/models') ? response(models) : response({ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(good) } }] }));
  assert.equal((await truncated()).status, 502);
  const malformed = await start(t, async url => url.endsWith('/models') ? response(models) : response({ choices: [{ message: { content: 'not-json' } }] }));
  assert.equal((await malformed()).status, 502);
});

test('one generation at a time and timeout releases the queue', async t => {
  let began;
  const started = new Promise(resolve => { began = resolve; });
  const send = await start(t, async (url, options) => {
    if (url.endsWith('/models')) return response(models);
    began();
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  }, { timeoutMs: 80 });
  const first = send();
  await started;
  assert.equal((await send()).status, 429);
  assert.equal((await first).status, 504);
  assert.equal((await send('/status', null)).status, 200);
});

test('context limits report excluded evidence rather than claiming full coverage', () => {
  const body = { ...input, items: Array.from({ length: 15 }, (_, i) => ({ ...input.items[0], id: `source-${i}`, evidence: Array(10).fill(quote.repeat(12)) })) };
  const prepared = prepareSources(body, 4096);
  assert.equal(prepared.coverage.totalSources, 15);
  assert.ok(prepared.coverage.includedSources < 15);
  assert.equal(prepared.coverage.clipped, true);
  assert.ok(JSON.stringify(prepared.items).length <= Math.floor((4096 - 2400) / 1.6));
});

test('weekly facts include range boundaries but exclude future/invalid dates', () => {
  const now = new Date('2026-11-24T12:00:00Z');
  const customer = (id, at) => ({ id, company: id, createdAt: '2020-01-01', activities: [{ at, summary: '제안서를 전달했습니다' }] });
  const run = executeRoutine('weekly', [customer('boundary', '2026-11-17T12:00:00Z'), customer('future', '2026-11-25T00:00:00Z'), customer('invalid', 'not-date')], [], now);
  assert.deepEqual(run.items.map(item => item.id), ['boundary']);
  assert.ok(!run.summary.includes('future'));
  const empty = executeRoutine('deadlines', [], [{ id: 'test', name: 'test', tasks: [{ id: 'a', title: '끝난 작업', dueDate: '2026-11-01', status: 'done' }] }], now);
  assert.equal(empty.status, 'empty');
});

test('damaged history is flagged without allowing malformed nested AI fields', () => {
  const run = executeRoutine('weekly', [], [], new Date('2026-11-24'));
  const restored = readRoutineHistory(JSON.stringify([run, { ...run, id: 'bad', aiDraft: { summary: [null] } }]));
  assert.equal(restored.runs.length, 1);
  assert.equal(restored.damaged, true);
  assert.equal(readRoutineHistory('{broken').damaged, true);
  assert.equal(readRoutineHistory(JSON.stringify([{ ...run, error: { message: 'broken' } }])).runs.length, 0);
  assert.equal(readRoutineHistory(JSON.stringify([{ ...run, sampleCount: null }])).damaged, true);
  assert.equal(isAiWeeklyDraft({ summary: [] }), false);
});
