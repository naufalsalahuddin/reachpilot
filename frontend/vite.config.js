import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy → the Express+Prisma API. Keeps calls same-origin so the session
// cookie just works in dev; in production the SPA is built and deployed
// separately and talks to the API's own URL (VITE_API_BASE) over CORS.
const API = process.env.VITE_API_TARGET || "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      ["/api", "/t", "/u", "/cron", "/webhook"].map((p) => [
        p,
        { target: API, changeOrigin: true },
      ]),
    ),
  },
});
