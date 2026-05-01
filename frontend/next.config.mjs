/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:3001/api/:path*',
      },
      {
        source: '/downloads/:path*',
        destination: 'http://127.0.0.1:3001/downloads/:path*',
      },
    ]
  },
};

export default nextConfig;
