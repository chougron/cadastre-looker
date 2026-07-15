import express from "express";
import serverlessHttp from "serverless-http";
import { createApiRouter } from "./api.js";

const app = express();
app.use("/api", createApiRouter());

export const handler = serverlessHttp(app);
