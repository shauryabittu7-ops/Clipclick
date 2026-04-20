import ShareViewer from "@/components/share/ShareViewer";

export default async function SharePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ShareViewer projectId={projectId} />;
}
