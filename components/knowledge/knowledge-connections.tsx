"use client";

import { useMemo, useState } from "react";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { buildKnowledgeGraph, stableWikiLink, type LinkDocument } from "@/lib/knowledge-links";

export function KnowledgeConnections({ documents, selectedId, onOpen, onInsert }: {
  documents: LinkDocument[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  onInsert: (link: string) => void;
}) {
  const graph = useMemo(() => buildKnowledgeGraph(documents), [documents]);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState("");
  const [zoom, setZoom] = useState(1);
  const [target, setTarget] = useState("");
  const [neighborsOnly, setNeighborsOnly] = useState(false);
  const byId = new Map(graph.documents.map((doc) => [doc.id, doc]));
  const refs = graph.outgoing.get(selectedId || "") || [];
  const backlinks = graph.backlinks.get(selectedId || "") || [];
  const neighbors = new Set([selectedId, ...refs.map((ref) => ref.documentId), ...backlinks]);
  const matching = graph.documents.filter((doc) => (!neighborsOnly || !selectedId || neighbors.has(doc.id)) && doc.title.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  const visible = matching.slice(0, 80);
  const points = new Map(visible.map((doc, index) => {
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    const radius = visible.length === 1 ? 0 : 215 * Math.sqrt(index / Math.max(1, visible.length - 1));
    return [doc.id, { x: 400 + Math.cos(angle) * radius * 1.35, y: 280 + Math.sin(angle) * radius }];
  }));
  const outgoing = refs.filter((ref, index) => refs.findIndex((other) => (other.documentId || other.target) === (ref.documentId || ref.target)) === index);
  const control = "knowledge-connection-button";

  return <section className="knowledge-connections" aria-label="문서 연결">
    <div className="knowledge-connections-heading">
      <div><h2>문서 연결</h2><p>본문에 <code>[[문서 제목]]</code>을 쓰면 연결됩니다. 제목이 바뀌어도 유지하려면 아래에서 링크를 넣으세요.</p></div>
      <button type="button" className={control} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><Maximize2 size={15} />{expanded ? "그래프 접기" : "연결 그래프"}</button>
    </div>
    {selectedId && <>
      <div className="knowledge-link-insert"><label htmlFor="knowledge-link-target">문서 링크 넣기</label><select id="knowledge-link-target" value={target} onChange={(event) => setTarget(event.target.value)}><option value="">연결할 문서 선택</option>{graph.documents.filter((doc) => doc.id !== selectedId).map((doc) => <option key={doc.id} value={doc.id}>{doc.title} · {doc.id.slice(0, 8)}</option>)}</select><button className={control} type="button" disabled={!byId.has(target)} onClick={() => { const doc = byId.get(target); if (doc) { onInsert(stableWikiLink(doc)); setTarget(""); } }}>링크 넣기</button></div>
      <div className="knowledge-link-columns">
        <div><h3>이 문서의 링크 <span>{outgoing.length}</span></h3><div className="knowledge-link-list">{outgoing.length ? outgoing.map((ref) => ref.documentId ? <button key={ref.documentId} className={control} onClick={() => onOpen(ref.documentId!)}>{byId.get(ref.documentId)?.title}</button> : <span className="knowledge-unresolved" key={ref.target}>{ref.label} · {ref.reason === "ambiguous" ? "같은 제목이 여러 개예요. 문서를 선택해 링크를 넣으세요." : "문서를 찾을 수 없어요"}</span>) : <p>아직 연결한 문서가 없습니다.</p>}</div></div>
        <div><h3>이 문서를 참조하는 문서 <span>{backlinks.length}</span></h3><div className="knowledge-link-list">{backlinks.length ? backlinks.map((id) => <button key={id} className={control} onClick={() => onOpen(id)}>{byId.get(id)?.title}</button>) : <p>아직 이 문서를 참조하는 문서가 없습니다.</p>}</div></div>
      </div>
    </>}
    {expanded && <div className="knowledge-graph-section">
      <div className="knowledge-graph-toolbar"><label>문서 찾기<input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="문서 제목 검색" /></label><label className="knowledge-neighbor-filter"><input type="checkbox" checked={neighborsOnly} disabled={!selectedId} onChange={(event) => setNeighborsOnly(event.target.checked)} />선택한 문서 주변만</label><div className="knowledge-zoom"><button className={control} aria-label="그래프 축소" disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - .5))}><Minus size={15} /></button><button className={control} aria-label="그래프 확대" disabled={zoom >= 3} onClick={() => setZoom(Math.min(3, zoom + .5))}><Plus size={15} /></button><button className={control} aria-label="그래프 배율 초기화" onClick={() => setZoom(1)}><RotateCcw size={15} /></button></div></div>
      <p className="knowledge-graph-summary">문서 {graph.documents.length}개 · 방향별 연결 {graph.edges.length}개 · 현재 표시 {visible.length}개{matching.length > 80 && " · 최대 80개까지 표시합니다. 검색으로 범위를 좁혀 주세요."}</p>
      {visible.length ? <div className="knowledge-graph-scroll" tabIndex={0} aria-label="문서 연결 지도. 확대하면 가로·세로로 스크롤할 수 있습니다."><svg viewBox="0 0 800 560" style={{ width: `${zoom * 100}%`, minWidth: 640 * zoom }} aria-label="문서를 누르면 해당 문서를 엽니다">
        {graph.edges.map(({ source, target: dest }) => { const a = points.get(source), b = points.get(dest); return a && b ? <line key={`${source}:${dest}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={source === selectedId || dest === selectedId ? "knowledge-edge active" : "knowledge-edge"} /> : null; })}
        {visible.map((doc) => { const point = points.get(doc.id)!; return <g key={doc.id} transform={`translate(${point.x},${point.y})`} role="button" tabIndex={0} aria-label={`문서 열기: ${doc.title}`} aria-pressed={doc.id === selectedId} className={`knowledge-graph-node ${doc.id === selectedId ? "selected" : ""}`} onClick={() => onOpen(doc.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(doc.id); } }}><title>{doc.title}</title><circle r="13" /><text y="30" textAnchor="middle">{doc.title.length > 17 ? `${doc.title.slice(0, 16)}…` : doc.title}</text></g>; })}
      </svg></div> : <p className="knowledge-graph-empty">{graph.documents.length ? "검색 조건에 맞는 문서가 없습니다." : "첫 문서를 만들고 다른 문서를 연결하면 여기에 표시됩니다."}</p>}
      {!!visible.length && <details className="knowledge-graph-list"><summary>표시된 문서를 목록으로 보기</summary><div className="knowledge-link-list">{visible.map((doc) => <button className={control} key={doc.id} onClick={() => onOpen(doc.id)}>{doc.title}</button>)}</div></details>}
    </div>}
  </section>;
}
