import type { NextConfig } from "next";

// Standalone output is ONLY for the container build. Vercel produces its own
// output format, so leaving this on unconditionally risks a broken deploy.
export default {
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
  // Keep the working tree free of generated instruction files: `next dev` would
  // otherwise write, and rewrite on every boot, markdown it manages itself.
  agentRules: false,
} satisfies NextConfig;
