import type { Metadata } from "next";
import { getPublicWorkspace } from "@/lib/workspace";
import FacesClient from "./faces-client";

export function generateMetadata(): Metadata {
  const workspace = getPublicWorkspace();
  return { title: `${workspace.productName} · Fit check — book faces` };
}

export default function FitCheckFacesPage() {
  return <FacesClient />;
}
