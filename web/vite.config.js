import { defineConfig } from "vite";

export default defineConfig({
  server: { proxy: { "/api": { target: process.env.TRACE_API || "http://localhost:9999", changeOrigin: true } } },
});
