/** @type {import('next').NextConfig} */
const nextConfig = {
  // xrpl.js uses Node APIs (ws, crypto): keep it server-side, unbundled.
  serverExternalPackages: ["xrpl"],
};
export default nextConfig;
