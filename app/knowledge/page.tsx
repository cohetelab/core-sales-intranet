import { baaldaServerUrl } from "@/lib/baalda";
import { KnowledgeConnection } from "@/components/knowledge/knowledge-connection";

export const dynamic = "force-dynamic";

export default function KnowledgePage() {
  return <KnowledgeConnection serverUrl={baaldaServerUrl()} />;
}
