import { redirect } from "next/navigation";

export default async function ItemsIndex({ params }: { params: Promise<{ projectId: string }> }) {
  redirect(`/forge/${(await params).projectId}`);
}
