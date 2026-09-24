import type { NextConfig } from "next";

const CHROMIUM_TRACE = "./node_modules/@sparticuz/chromium/**";
const PLAYWRIGHT_TRACE = "./node_modules/playwright-core/**";
const PACK_DEPENDENCY_TRACE = [
  "./node_modules/tar-fs/**",
  "./node_modules/tar-stream/**",
  "./node_modules/pump/**",
  "./node_modules/end-of-stream/**",
  "./node_modules/once/**",
  "./node_modules/wrappy/**",
  "./node_modules/b4a/**",
  "./node_modules/fast-fifo/**",
  "./node_modules/streamx/**",
  "./node_modules/text-decoder/**",
  "./node_modules/teex/**",
  "./node_modules/events-universal/**",
  "./node_modules/bare-events/**",
  "./node_modules/bare-fs/**",
  "./node_modules/bare-path/**",
  "./node_modules/bare-stream/**",
  "./node_modules/bare-url/**",
];

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
  // The pack's own runtime dependencies. `outputFileTracingIncludes` entries are raw globs, not
  // trace roots: including `@sparticuz/chromium/**` ships the package's files and nothing it
  // imports, and the matching `/api/**` exclude has already removed whatever the tracer reached
  // through it. The deployed function therefore had the pack but not `tar-fs`, and every launch
  // died with `ERR_MODULE_NOT_FOUND: Cannot find package 'tar-fs' imported from
  // @sparticuz/chromium/build/helper.js` - read off the production function log, 2026-09-16.
  // This is the whole transitive closure of `@sparticuz/chromium`'s dependencies (17 packages,
  // a few hundred KB); the `bare-*` ones are only reached under the Bare runtime but cost
  // nothing to carry and would fail the same way if a code path ever touched them.
  outputFileTracingIncludes: {
    "/api/authoring": [CHROMIUM_TRACE, PLAYWRIGHT_TRACE, ...PACK_DEPENDENCY_TRACE],
    "/api/mcp": [CHROMIUM_TRACE, PLAYWRIGHT_TRACE, ...PACK_DEPENDENCY_TRACE],
  },
  // TBI redo G1: a dropzone link is a capability (like a signed URL), so its page never sends a
  // referrer, is never indexed and is never cached.
  async headers() {
    return [{source: "/import/:token*", headers: [{key: "Referrer-Policy", value: "no-referrer"}, {key: "X-Robots-Tag", value: "noindex, nofollow"}, {key: "Cache-Control", value: "no-store"}]}];
  },
};

export default nextConfig;
