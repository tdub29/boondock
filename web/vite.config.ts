import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static-hostable PWA. No backend. PMTiles + ArcGIS REST are fetched at runtime.
export default defineConfig({
  // Relative base: assets resolve at any mount path (served at /offroad/ in the phone portal,
  // and at root standalone). Survives rebuilds without a hand-passed --base flag.
  base: "./",
  plugins: [react()],
  resolve: { dedupe: ["maplibre-gl"] },
  server: {
    port: 5173,
    host: true, // expose on LAN so you can test on a phone
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
