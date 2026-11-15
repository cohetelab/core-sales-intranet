import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKnowledgeGraph, wikiReferences, stableWikiLink } from '../lib/knowledge-links.ts';

const doc = (id, title, body_text = '', deleted_at = null) => ({ id, title, body_text, deleted_at });

test('title references, aliases, directed backlinks and duplicate links', () => {
  const graph = buildKnowledgeGraph([doc('a', '제안서', '[[고객사]] [[고객사|다른 표시]]'), doc('b', '고객사', '[[제안서]]')]);
  assert.deepEqual(graph.edges, [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }]);
  assert.deepEqual(graph.backlinks.get('b'), ['a']);
  assert.equal(graph.outgoing.get('a')[1].label, '다른 표시');
});

test('duplicate titles fail closed; stable IDs survive title changes', () => {
  const graph = buildKnowledgeGraph([doc('a', '출처', '[[중복]] [[b|원래 제목]]'), doc('b', '바뀐 제목'), doc('c', '중복'), doc('d', '중복')]);
  assert.equal(graph.outgoing.get('a')[0].reason, 'ambiguous');
  assert.deepEqual(graph.edges, [{ source: 'a', target: 'b' }]);
});

test('deleted and unavailable documents are not exposed; restore rebuilds the link', () => {
  const a = doc('a', '출처', '[[비공개]] [[b]]');
  const b = doc('b', '삭제 문서', '', '2026-11-14');
  const graph = buildKnowledgeGraph([a, b]);
  assert.equal(graph.documents.length, 1);
  assert.equal(graph.edges.length, 0);
  assert.ok(graph.outgoing.get('a').every((ref) => ref.reason === 'missing'));
  assert.equal(buildKnowledgeGraph([a, { ...b, deleted_at: null }]).edges.length, 1);
});

test('self links, escaped examples, malformed links and empty content', () => {
  assert.equal(buildKnowledgeGraph([doc('a', '자기', '[[자기]]')]).edges.length, 0);
  assert.deepEqual(wikiReferences('\\[[예제]] [[ ]] [[줄\n바꿈]]'), []);
  assert.equal(buildKnowledgeGraph([]).documents.length, 0);
});

test('Unicode titles normalize and stable labels cannot break link syntax', () => {
  assert.equal(buildKnowledgeGraph([doc('a', '출처', '[[가]]'), doc('b', '가')]).edges[0].target, 'b');
  assert.equal(wikiReferences(stableWikiLink(doc('b', '고객]] [[다른|제목'))).length, 1);
});
