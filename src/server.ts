import path from "node:path";
import express from "express";
import { createApiRouter } from "./api.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const PUBLIC_DIR = path.resolve(import.meta.dirname, "..", "public");

app.use(express.static(PUBLIC_DIR));
app.use("/api", createApiRouter());

app.listen(PORT, () => {
  console.log(`Cadastre Looker running at http://localhost:${PORT}`);
});
