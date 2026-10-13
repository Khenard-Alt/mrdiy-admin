import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 blocks cross-origin requests to the dev server by default
  // (see node_modules/next/dist/docs/.../allowedDevOrigins.md). Needed to open
  // this admin from another device through VS Code's Ports panel port
  // forwarding, which proxies through Microsoft's Dev Tunnels service.
  allowedDevOrigins: ["**.devtunnels.ms"],
};

export default nextConfig;
