import { config } from "dotenv";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const port = Number(process.env.API_PORT || 5002);
const app = createApp();

serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`API listening on http://127.0.0.1:${info.port}`);
});
