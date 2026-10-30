import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

function loadRedirects(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "redirects.json"), "utf8"));
  } catch {
    return {};
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return Object.entries(loadRedirects()).map(([from, to]) => ({
      source: `/places/${from}`,
      destination: `/places/${to}`,
      permanent: true,
    }));
  },
};

export default nextConfig;
