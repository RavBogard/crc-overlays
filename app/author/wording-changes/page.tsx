import type { Metadata } from "next";
import { getPublicWorkspace } from "@/lib/workspace";
import WordingChangesClient from "./wording-changes-client";

export function generateMetadata(): Metadata {
  const workspace = getPublicWorkspace();
  return { title: `${workspace.productName} · Wording changes` };
}

export default function WordingChangesPage() {
  return <WordingChangesClient />;
}
