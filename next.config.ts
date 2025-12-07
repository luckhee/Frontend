import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.devteam10.org",
        port: "",
        pathname: "/files/**",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
        port: "",
        pathname: "/team10_bucket/**",
      },
      {
        protocol: "http", // 개발 환경은 http
        hostname: "localhost",
        port: "9000", // MinIO 포트
        pathname: "/dev-bucket/**", // 버킷명
      },
      // ===== MinIO 홈서버 (선택사항) =====
      {
        protocol: "http",
        hostname: "118.42.214.23", // 홈서버 IP
        port: "9000",
        pathname: "/dev-bucket/**",
      },
    ],
  },
  env: {
    NEXT_PUBLIC_BACKEND_URL: "http://localhost:8080",
    NEXT_PUBLIC_WEBSOCKET_URL: "http://localhost:8080chat",
    // 백엔드 주소
    // NEXT_PUBLIC_BACKEND_URL: "http://34.64.160.179:8080",
    // NEXT_PUBLIC_WEBSOCKET_URL: "ws://34.64.160.179:8080/chat",
  },
  // WebSocket 연결을 위한 설정
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
