import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 자동 시험(tests/run-all.cjs)은 NEXT_DIST_DIR=.next-test 로 개발 서버를 띄운다. 같은 폴더에서 다른 개발 서버(.next)가 이미 떠 있어도 서로 막지 않게 하려는 것이다.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    cpus: 2,
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
