import "dotenv/config";
import express from "express";
import { requestLogger } from "./middlewares/requestLogger";
import { globalErrorHandler } from "./middlewares/errorHandler";
import { logger } from "./utils/winston";

const app = express();

app.use(express.json());
app.use(requestLogger());

// Health check
app.get("/health", (_req, res) => {
  res.json({ success: true, status: 200, message: "OK" });
});

// Global error handler — must be registered last
app.use(globalErrorHandler);

const port = Number(process.env.NODE_PORT ?? 3000);
const host = process.env.NODE_HOST ?? "0.0.0.0";

app.listen(port, host, () => {
  logger.info(`Server listening on ${host}:${port}`);
});

export default app;
