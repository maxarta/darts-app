import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Expose server-style env names to client only for public values.
  const authorTelegram =
    env.VITE_AUTHOR_TELEGRAM ||
    env.NEXT_PUBLIC_AUTHOR_TELEGRAM ||
    "https://t.me/maxartemyev";
  const extendedAccessCode =
    env.VITE_EXTENDED_ACCESS_CODE ||
    env.NEXT_PUBLIC_EXTENDED_ACCESS_CODE ||
    "polyana";

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: false,
        includeAssets: [
          "favicon.ico",
          "logo.svg",
          "icons/icon-192.png",
          "icons/icon-512.png",
        ],
        manifest: {
          name: "Darts Score",
          short_name: "Darts",
          description: "Подсчёт очков 301/501, турниры и статистика",
          lang: "ru",
          theme_color: "#ffdf20",
          background_color: "#ffdf20",
          display: "standalone",
          start_url: "/",
          scope: "/",
          icons: [
            {
              src: "/icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "/icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "/icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          navigateFallback: "/index.html",
          // Keep the home shell small — skip ORT/WASM and huge model weights.
          globPatterns: [
            "**/*.{js,css,html,ico,png,svg,woff2,webp,jpg,jpeg}",
          ],
          globIgnores: ["**/ort*.js", "**/*.wasm", "**/models/**"],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
              handler: "NetworkOnly",
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith("/assets/"),
              handler: "CacheFirst",
              options: {
                cacheName: "darts-assets",
                expiration: {
                  maxEntries: 80,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
              },
            },
            {
              urlPattern: ({ request }) =>
                request.destination === "image" ||
                request.destination === "font" ||
                request.destination === "style" ||
                request.destination === "script",
              handler: "CacheFirst",
              options: {
                cacheName: "darts-static",
                expiration: {
                  maxEntries: 120,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
              },
            },
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "darts-pages",
                networkTimeoutSeconds: 3,
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
        "next/image": path.resolve(__dirname, "src/shims/next-image.tsx"),
        "next/link": path.resolve(__dirname, "src/shims/next-link.tsx"),
        "next/navigation": path.resolve(
          __dirname,
          "src/shims/next-navigation.ts"
        ),
      },
    },
    define: {
      "process.env.NEXT_PUBLIC_AUTHOR_TELEGRAM": JSON.stringify(authorTelegram),
      "process.env.VITE_EXTENDED_ACCESS_CODE": JSON.stringify(
        extendedAccessCode
      ),
      "process.env.NEXT_PUBLIC_EXTENDED_ACCESS_CODE": JSON.stringify(
        extendedAccessCode
      ),
      "process.env.NODE_ENV": JSON.stringify(
        mode === "production" ? "production" : "development"
      ),
    },
    server: {
      host: true,
      port: 5001,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:5002",
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 5001,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:5002",
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
