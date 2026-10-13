import { redirect } from "next/navigation";

export default async function ExportIndex({ params }: { params: Promise<{ projectId: string }> }) {
  redirect(`/forge/${(await params).projectId}/exports`);
}
