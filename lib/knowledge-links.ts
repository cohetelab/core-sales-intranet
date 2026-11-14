/** Links are derived only from the documents the workspace API has authorized.
 * Stable links use [[document-id|label]]; title links must resolve uniquely.
 * No separate graph store, external service, or extra database permissions.
 */
export type LinkDocument = { id: string; title: string; body_text: string; deleted_at?: string | null };
export type WikiReference = { target: string; label: string; start: number; end: number };
export type ResolvedReference = WikiReference & { documentId: string | null; reason: "missing" | "ambiguous" | null };
export type KnowledgeGraph = { documents: LinkDocument[]; edges: { source: string; target: string }[]; outgoing: Map<string, ResolvedReference[]>; backlinks: Map<string, string[]> };

const normalize = (value: string) => value.normalize("NFC").trim().toLocaleLowerCase("ko-KR");

export function wikiReferences(text: string): WikiReference[] {
  return [...text.matchAll(/\[\[([^\[\]\n]{1,300})\]\]/g)].flatMap((match) => {
    // Backslash escapes let authors show syntax without creating a relationship.
    let slashes = 0;
    for (let i = match.index! - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
    if (slashes % 2) return [];
    const [target, ...alias] = match[1].split("|");
    if (!target.trim()) return [];
    return [{ target: target.trim(), label: alias.join("|").trim() || target.trim(), start: match.index!, end: match.index! + match[0].length }];
  });
}

export function buildKnowledgeGraph(input: LinkDocument[]): KnowledgeGraph {
  const documents = input.filter((doc) => !doc.deleted_at);
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  const byTitle = new Map<string, string[]>();
  for (const doc of documents) {
    const key = normalize(doc.title);
    byTitle.set(key, [...(byTitle.get(key) || []), doc.id]);
  }
  const outgoing = new Map<string, ResolvedReference[]>();
  const backlinks = new Map<string, string[]>();
  const edges: KnowledgeGraph["edges"] = [];
  const seen = new Set<string>();
  for (const doc of documents) {
    const refs = wikiReferences(doc.body_text).map((ref): ResolvedReference => {
      const candidates = byId.has(ref.target) ? [ref.target] : byTitle.get(normalize(ref.target)) || [];
      return { ...ref, documentId: candidates.length === 1 ? candidates[0] : null, reason: candidates.length === 1 ? null : candidates.length ? "ambiguous" : "missing" };
    });
    outgoing.set(doc.id, refs);
    for (const ref of refs) {
      if (!ref.documentId || ref.documentId === doc.id) continue;
      const key = JSON.stringify([doc.id, ref.documentId]);
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: doc.id, target: ref.documentId });
      backlinks.set(ref.documentId, [...(backlinks.get(ref.documentId) || []), doc.id]);
    }
  }
  return { documents, edges, outgoing, backlinks };
}

export function stableWikiLink(doc: Pick<LinkDocument, "id" | "title">) {
  return `[[${doc.id}|${doc.title.replace(/[\[\]\n|]/g, " ").trim()}]]`;
}
