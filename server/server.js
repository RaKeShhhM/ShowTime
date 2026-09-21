import "dotenv/config";
import { createServer } from "node:http";
import mongoose from "mongoose";
import connectDB from "./configs/db.js";
import createApp from "./app.js";
import { logger } from "./configs/observability.js";
import { initializeSocketServer } from "./realtime/socketServer.js";

const port = Number(process.env.PORT) || 3000;

try {
  await connectDB();
  const app = createApp();
  const server = createServer(app);
  initializeSocketServer(server);
  server.listen(port, () =>
    logger.info({ port }, "Server listening")
  );

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Graceful shutdown started");
    server.close(async (error) => {
      if (error) logger.error({ err: error }, "HTTP server close failed");
      try {
        await mongoose.connection.close();
        logger.info("MongoDB connection closed");
        process.exitCode = error ? 1 : 0;
      } catch (closeError) {
        logger.error({ err: closeError }, "MongoDB close failed");
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
} catch (error) {
  logger.fatal({ err: error }, "Failed to start server");
  process.exitCode = 1;
}
