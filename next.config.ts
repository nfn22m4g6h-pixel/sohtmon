import type { NextConfig } from "next";

// ERP — полностью динамические данные пользователя, поэтому используется
// классическая динамическая отрисовка (без Cache Components).
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
