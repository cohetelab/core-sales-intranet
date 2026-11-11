// Run in the checks image with --network core-baalda_default, mounting this
// file in /repo/app/apps/server and the ignored local/ directory at /evidence.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { HocuspocusProvider } from '@hocuspocus/provider';
import WebSocket from 'ws';
import * as Y from 'yjs';

const base = process.env.BAALDA_VERIFY_URL || 'http://server:3010';
const results = [];
const connections = [];
let session;
let mcpToken;
let rpcId = 0;
async function request(path, method = 'GET', body, headers = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { origin: 'http://localhost:4310', ...(session ? { authorization: `Bearer ${session}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  assert.ok(res.ok, `${method} ${path}: ${res.status} ${JSON.stringify(data)}`);
  return { data, res };
}
async function tool(name, args) {
  const { data } = await request('/api/mcp', 'POST', { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }, { authorization: `Bearer ${mcpToken}` });
  assert.ok(!data.error && !data.result?.isError, `${name}: ${JSON.stringify(data)}`);
  return data.result.structuredContent;
}
async function until(fn, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Timed out: ${label}`);
}
try {
  assert.equal((await request('/health')).data.ok, true);
  results.push('server-health');
  const saved = await readFile('/evidence/test-account.json', 'utf8').then(JSON.parse).catch(() => null);
  const email = saved?.email || `core-verify-${Date.now()}@example.test`;
  const password = saved?.password || randomBytes(24).toString('base64url');
  const signup = await request(saved ? '/api/auth/sign-in/email' : '/api/auth/sign-up/email', 'POST', { email, password, name: 'Core Baalda verification' });
  session = signup.res.headers.get('set-auth-token') || signup.data.token;
  assert.ok(session, 'signup session missing');
  await writeFile('/evidence/test-account.json', JSON.stringify({ email, password, serverUrl: 'http://localhost:4310' }, null, 2));
  const orgs = (await request('/api/auth/organization/list')).data;
  const org = orgs[0] || (await request('/api/auth/organization/create', 'POST', { name: 'Core 설치 검증', slug: `core-verify-${Date.now()}` })).data;
  await request('/api/auth/organization/set-active', 'POST', { organizationId: org.id });
  const { vaults } = (await request('/api/vaults')).data;
  const vault = vaults.find(v => v.organization_id === org.id) || (await request('/api/vaults', 'POST', { name: 'Core 설치 검증', organizationId: org.id })).data;
  assert.ok(vault, 'organization vault missing');
  mcpToken = (await request('/api/mcp/tokens', 'POST', { name: 'Core local verification' })).data.token;
  if (process.argv.includes('--persistence')) {
    const previous = JSON.parse(await readFile('/evidence/live-result.json', 'utf8'));
    const restored = await tool('read_note', { docId: previous.note.docId });
    assert.equal(restored.content, previous.note.content);
    assert.equal(restored.relPath, '검증-이름변경.md');
    previous.persistence = { verifiedAt: new Date().toISOString(), contentAndIdentityPreserved: true };
    await writeFile('/evidence/live-result.json', JSON.stringify(previous, null, 2));
    console.log('PASS: content and identity preserved after PostgreSQL + server restart');
    process.exit(0);
  }
  const note = await tool('create_note', { vaultId: vault.id, relPath: '검증.md', content: '# Core Baalda\n\n설치 검증 문서\n' });
  let content = await tool('read_note', { docId: note.docId });
  assert.match(content.content, /설치 검증 문서/);
  results.push('account-vault-mcp-create-read');
  const token = (await request('/api/sync-token', 'POST', { docId: note.docId })).data.token;
  for (let i = 0; i < 2; i++) {
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({ url: base.replace(/^http/, 'ws') + '/sync', name: `vault:${vault.id}/note:${note.docId}`, token, document: doc, WebSocketPolyfill: WebSocket });
    connections.push({ doc, provider });
    await until(() => provider.isSynced, 'client initial sync');
  }
  const a = connections[0].doc.getText('content');
  const b = connections[1].doc.getText('content');
  a.insert(a.length, '\nclient-A\n');
  b.insert(0, 'client-B\n');
  await until(() => a.toString() === b.toString() && a.toString().includes('client-A') && a.toString().includes('client-B'), 'concurrent convergence');
  await until(async () => (await tool('read_note', { docId: note.docId })).content === a.toString(), 'MCP sees websocket edits');
  results.push('two-authenticated-websocket-clients-converge');
  content = await tool('read_note', { docId: note.docId });
  await tool('append_note', { docId: note.docId, text: '\nMCP live update\n', expectedRevision: content.revision });
  await until(() => a.toString().includes('MCP live update') && b.toString().includes('MCP live update'), 'MCP broadcast');
  results.push('mcp-write-broadcast-to-both-clients');
  await request(`/api/notes/${note.docId}`, 'PATCH', { relPath: '검증-이름변경.md', title: '검증-이름변경' });
  assert.equal((await tool('read_note', { docId: note.docId })).relPath, '검증-이름변경.md');
  results.push('rename-preserves-document-identity');
  const bytes = Buffer.from('Core Baalda attachment verification\n');
  const uploaded = await fetch(`${base}/api/vaults/${vault.id}/blobs`, { method: 'POST', headers: { origin: 'http://localhost:4310', authorization: `Bearer ${session}`, 'content-type': 'text/plain', 'x-file-name': 'probe.txt', 'x-rel-path': 'attachments/probe.txt' }, body: bytes });
  const attachment = await uploaded.json();
  assert.ok(uploaded.ok, JSON.stringify(attachment));
  const downloaded = await fetch(`${base}/api/blobs/${attachment.id}`, { headers: { authorization: `Bearer ${session}` } });
  assert.ok(downloaded.ok);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
  results.push('attachment-upload-download-byte-match');
  const disposable = await tool('create_note', { vaultId: vault.id, relPath: '삭제검증.md', content: 'Disposable verification note' });
  await tool('delete_note', { docId: disposable.docId });
  results.push('note-soft-delete');
  const evidence = { at: new Date().toISOString(), revision: '90929b5a68de3f5347cbf2084ee672dd41264234', results, note: { vaultId: vault.id, docId: note.docId, content: a.toString() } };
  await writeFile('/evidence/live-result.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ results, noteId: note.docId }, null, 2));
} finally {
  for (const { doc, provider } of connections) { provider.destroy(); doc.destroy(); }
}
