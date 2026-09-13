import type { Metadata } from "next";
import { getPublicWorkspace } from "@/lib/workspace";
import FitCheckClient from "./fit-check-client";

export function generateMetadata(): Metadata {
  const workspace = getPublicWorkspace();
  return { title: `${workspace.productName} · Fit check` };
}

export default function FitCheckPage() {
  return <FitCheckClient />;
}
