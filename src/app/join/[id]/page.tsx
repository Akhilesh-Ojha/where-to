import { JoinPage } from "@/components/join-page";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <JoinPage planId={id} />;
}
