import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createApi, startAutomation } from "./server/api.js";

// A API local (análise de sites + CSV em resultados/) roda junto com o Vite
const prospectApi = () => {
  const api = createApi({ resultsDir: path.resolve("resultados") });
  return {
    name: "prospect-api",
    // Sem "return": o Vite trataria a função retornada como gancho posterior
    configureServer(server) {
      server.middlewares.use(api);
      startAutomation().catch((e) => console.error("Automação:", e.message));
    },
    configurePreviewServer(server) { server.middlewares.use(api); },
  };
};

export default defineConfig({
  plugins: [react(), prospectApi()],
  server: { host: "127.0.0.1", port: 5175 },
  preview: { host: "127.0.0.1", port: 5175 },
});
