import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy → the Express+Prisma API. Keeps calls same-origin so the session
// cookie just works in dev; in production the SPA is built and deployed
// separately and talks to the API's own URL (VITE_API_BASE) over CORS.
const API = process.env.VITE_API_TARGET || "http://localhost:3000";
const PORT = process.env.VITE_API_PORT || 5173;

export default defineConfig({
  plugins: [react()],
  server: {
    port: PORT,
    proxy: Object.fromEntries(
      ["/api", "/t", "/u", "/cron", "/webhook"].map((p) => [
        p,
        { target: API, changeOrigin: true },
      ]),
    ),
  },
});
