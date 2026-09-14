import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16.3 writes AGENTS.md/CLAUDE.md into the repo root on `next dev`; this repo
  // keeps its own handoff docs, so the generated rules would only confuse agents.
  agentRules: false,
  // R7 - the Chromium pack and the Playwright driver are native/binary packages. They must be
  // traced into the function as real node_modules rather than bundled, or the .br pack and the
  // driver's own files are lost.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  // The Chromium pack itself (bin/*.br) is resolved at runtime from the package's own
  // directory, so the file tracer cannot see it statically and would ship the route without a
  // browser. Including it explicitly is what makes the Vercel path work at all; without it
  // every fit check would honestly report `unavailable`.
  // The tracer also follows the dynamic import() chain from lib/authoring into lib/server-fit and
  // on into playwright-core, so without an exclude every API route that touches authoring
  // carried the 11 MB driver (20 of 49 entrypoints, including the public /api/now). Exclude both
  // packages from every API route, then include them - pack and driver - only where a fit check
  // can actually run: the authoring route and the MCP route (the MCP route had no pack include
  // before, so a fit check driven through MCP on Vercel would have reported unavailable).
  outputFileTracingExcludes: {
    "/api/**": ["./node_modules/playwright-core/**", "./node_modules/@sparticuz/chromium/**"],
  },
  outputFileTracingIncludes: {
    "/api/authoring": ["./node_modules/@sparticuz/chromium/**", "./node_modules/playwright-core/**"],
    "/api/mcp": ["./node_modules/@sparticuz/chromium/**", "./node_modules/playwright-core/**"],
  },
};

export default nextConfig;
