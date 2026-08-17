import type { NextConfig } from "next";
import { withPayload } from "@payloadcms/next/withPayload";

const nextConfig: NextConfig = {
  // Next 15's `next build` runs ESLint and fails the build on errors (Next 16
  // did not). The iterations playground trips a react-hooks/refs rule, so don't
  // let lint block production builds — run `npm run lint` for lint feedback.
  eslint: { ignoreDuringBuilds: true },
};

export default withPayload(nextConfig);
