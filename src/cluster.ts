/**
 * Entrypoint — OTel MUST be initialised before any other import.
 */
import { initTracing, shutdownTracing } from "./utils/tracing";
initTracing();

import "dotenv/config";
import cluster from "node:cluster";
import os from "node:os";
import process from "node:process";
import { logger } from "./utils/winston";

const isClustered = process.env.NODE_ENABLE_CLUSTERING === "true";
const numCPUs = os.availableParallelism?.() ?? os.cpus().length;

async function main() {
  if (isClustered && cluster.isPrimary) {
    logger.info(`Primary ${process.pid} starting ${numCPUs} workers`);
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }
    cluster.on("exit", (worker, code, signal) => {
      logger.warn(`Worker ${worker.process.pid} exited`, { code, signal });
      cluster.fork();
    });
  } else {
    await import("./app");
  }
}

main().catch((err) => {
  logger.error("Fatal startup error", { err });
  process.exit(1);
});

process.on("SIGTERM", async () => {
  logger.info("SIGTERM received — shutting down");
  await shutdownTracing();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await shutdownTracing();
  process.exit(0);
});
