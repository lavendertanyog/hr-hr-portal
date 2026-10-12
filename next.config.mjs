/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // The old HR Leave page was replaced by Approvals > Leave Requests (the tab /admin opens on).
      { source: '/leave', destination: '/admin', permanent: false },
      // The Audit Log page is hidden from HR for now; the page code stays in app/audit-log.
      { source: '/audit-log', destination: '/admin', permanent: false },
    ];
  },
};

export default nextConfig;
