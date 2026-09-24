import type { Metadata } from "next";
import { getPublicWorkspace } from "@/lib/workspace";
import PublicationsClient from "./publications-client";

export function generateMetadata(): Metadata {
  const workspace = getPublicWorkspace();
  return { title: `${workspace.productName} · Recent publications` };
}

export default function PublicationsPage() {
  return <PublicationsClient />;
}
