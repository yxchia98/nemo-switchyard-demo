/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The browser never talks to Switchyard directly. Every call goes through
  // the route handlers in app/api/*, so SWITCHYARD_BASE_URL stays server-side
  // and there is no CORS configuration to debug during the lab.
};

export default nextConfig;
