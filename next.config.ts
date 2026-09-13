import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16.3 writes AGENTS.md/CLAUDE.md into the repo root on `next dev`; this repo
  // keeps its own handoff docs, so the generated rules would only confuse agents.
  agentRules: false,
};

export default nextConfig;
