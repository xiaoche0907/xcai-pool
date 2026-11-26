import "dotenv/config";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
  root: path.resolve("apps/admin-web"),
  plugins: [react()],
  build: { outDir: path.resolve("dist/admin"), emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: 4311,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${process.env.PORT ?? 4310}` },
  },
});
