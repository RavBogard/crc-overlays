import type { Metadata } from "next";
import { getPublicWorkspace } from "@/lib/workspace";
import ReviewClient from "../review-client";

export function generateMetadata(): Metadata {
  const workspace = getPublicWorkspace();
  return { title: `${workspace.productName} · Review` };
}

export default async function ReviewBoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  return <ReviewClient boardId={boardId} />;
}
