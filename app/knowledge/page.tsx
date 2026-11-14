import { knowledgeConfig } from "@/lib/knowledge-auth";
import { KnowledgeWorkspace } from "@/components/knowledge/knowledge-workspace";

export const dynamic = "force-dynamic";

export default function KnowledgePage() {
  return <KnowledgeWorkspace config={knowledgeConfig()} />;
}
