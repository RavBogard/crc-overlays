import type { Metadata } from "next";
import { getPublicWorkspace } from "@/lib/workspace";
import FitStageClient from "./fit-stage-client";

// D17 — the measurement stage the server-side fit check drives. It is deliberately
// unlinked: nothing in the product navigates here, and it carries no data, no
// credential and no navigation of its own. Only the headless browser opens it.
export const metadata: Metadata = { title: "Fit stage", robots: { index: false, follow: false } };

export default function FitStagePage() {
  // Workspace branding is the same public identity /api/workspace already serves, passed
  // in directly so the stage needs no fetch and no session to render a frame.
  return <FitStageClient workspace={getPublicWorkspace()} />;
}
