import { createReadStream, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const localPortrait = fileURLToPath(new URL("./.data/portrait.json", import.meta.url));

/** Serves the locally built portrait in dev only, so real chat data never lands in a production bundle. */
function localData(): Plugin {
  return {
    name: "portrait-local-data",
    configureServer(server) {
      server.middlewares.use("/portrait.json", (_req, res, next) => {
        if (!existsSync(localPortrait)) return next();
        res.setHeader("content-type", "application/json");
        res.setHeader("cache-control", "no-store");
        createReadStream(localPortrait).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localData()],
  server: { host: true, port: 5180 },
});
