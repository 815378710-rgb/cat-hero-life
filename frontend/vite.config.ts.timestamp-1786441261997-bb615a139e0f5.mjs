// vite.config.ts
import { defineConfig } from "file:///D:/WorkBuddy/2026-07-03-14-32-47/cat-hero-life-main/frontend/node_modules/vite/dist/node/index.js";
import vue from "file:///D:/WorkBuddy/2026-07-03-14-32-47/cat-hero-life-main/frontend/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import { resolve } from "path";
var __vite_injected_original_dirname = "D:\\WorkBuddy\\2026-07-03-14-32-47\\cat-hero-life-main\\frontend";
var vite_config_default = defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": resolve(__vite_injected_original_dirname, "src")
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true
  },
  // 生产构建剔除 console.*（审计 #21，减小体积并避免泄露内部状态）
  esbuild: process.env.NODE_ENV === "production" ? { drop: ["console"] } : {}
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxXb3JrQnVkZHlcXFxcMjAyNi0wNy0wMy0xNC0zMi00N1xcXFxjYXQtaGVyby1saWZlLW1haW5cXFxcZnJvbnRlbmRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXFdvcmtCdWRkeVxcXFwyMDI2LTA3LTAzLTE0LTMyLTQ3XFxcXGNhdC1oZXJvLWxpZmUtbWFpblxcXFxmcm9udGVuZFxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vRDovV29ya0J1ZGR5LzIwMjYtMDctMDMtMTQtMzItNDcvY2F0LWhlcm8tbGlmZS1tYWluL2Zyb250ZW5kL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcbmltcG9ydCB2dWUgZnJvbSAnQHZpdGVqcy9wbHVnaW4tdnVlJ1xuaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gJ3BhdGgnXG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFt2dWUoKV0sXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgJ0AnOiByZXNvbHZlKF9fZGlybmFtZSwgJ3NyYycpXG4gICAgfVxuICB9LFxuICBzZXJ2ZXI6IHtcbiAgICBwb3J0OiA1MTczLFxuICAgIHByb3h5OiB7XG4gICAgICAnL2FwaSc6IHtcbiAgICAgICAgdGFyZ2V0OiAnaHR0cDovL2xvY2FsaG9zdDozMDAwJyxcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlXG4gICAgICB9XG4gICAgfVxuICB9LFxuICBidWlsZDoge1xuICAgIG91dERpcjogJy4uL2Rpc3QnLFxuICAgIGVtcHR5T3V0RGlyOiB0cnVlXG4gIH0sXG4gIC8vIFx1NzUxRlx1NEVBN1x1Njc4NFx1NUVGQVx1NTI1NFx1OTY2NCBjb25zb2xlLipcdUZGMDhcdTVCQTFcdThCQTEgIzIxXHVGRjBDXHU1MUNGXHU1QzBGXHU0RjUzXHU3OUVGXHU1RTc2XHU5MDdGXHU1MTREXHU2Q0M0XHU5NzMyXHU1MTg1XHU5MEU4XHU3MkI2XHU2MDAxXHVGRjA5XG4gIGVzYnVpbGQ6IHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbicgPyB7IGRyb3A6IFsnY29uc29sZSddIH0gOiB7fVxufSlcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBZ1gsU0FBUyxvQkFBb0I7QUFDN1ksT0FBTyxTQUFTO0FBQ2hCLFNBQVMsZUFBZTtBQUZ4QixJQUFNLG1DQUFtQztBQUl6QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsSUFBSSxDQUFDO0FBQUEsRUFDZixTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLFFBQVEsa0NBQVcsS0FBSztBQUFBLElBQy9CO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLFFBQ04sUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLE1BQ2hCO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxJQUNSLGFBQWE7QUFBQSxFQUNmO0FBQUE7QUFBQSxFQUVBLFNBQVMsUUFBUSxJQUFJLGFBQWEsZUFBZSxFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDO0FBQzVFLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
