import { SampleListPublisher } from "@/components/influencers/sample-list-publisher";

export default async function SampleListsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const { group } = await searchParams;
  return <SampleListPublisher initialGroupId={group ?? null} />;
}
