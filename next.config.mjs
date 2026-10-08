/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // The old HR Leave page was replaced by Approvals > Leave Requests (the tab /admin opens on).
      { source: '/leave', destination: '/admin', permanent: false },
    ];
  },
};

export default nextConfig;
