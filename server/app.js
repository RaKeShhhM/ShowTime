import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import mongoose from "mongoose";
import { clerkMiddleware } from "@clerk/express";
import { serve } from "inngest/express";
import { inngest, functions } from "./inngest/index.js";
import showRouter from "./routes/showRoutes.js";
import bookingRouter from "./routes/bookingRoutes.js";
import adminRouter from "./routes/adminRoutes.js";
import userRouter from "./routes/userRoutes.js";
import { stripeWebhooks } from "./controllers/stripeWebhooks.js";
import AppError from "./errors/AppError.js";
import { requestLogger } from "./configs/observability.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!allowedOrigins.length && process.env.NODE_ENV !== "production") {
  allowedOrigins.push("http://localhost:5173");
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new AppError("Origin is not allowed.", 403, "CORS_ORIGIN_DENIED"));
  },
  credentials: true,
};

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  handler: (req, res, next) => next(new AppError("Too many requests.", 429, "RATE_LIMITED")),
});

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  handler: (req, res, next) => next(new AppError("Too many booking attempts.", 429, "BOOKING_RATE_LIMITED")),
});

const createApp = () => {
  const app = express();

  app.use(requestLogger);
  app.use(helmet());

  // Stripe verifies the exact raw payload, so this stays ahead of JSON parsing and limiters.
  app.use(
    "/api/stripe",
    express.raw({ type: "application/json" }),
    stripeWebhooks,
  );
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "100kb" }));
  app.use(cors(corsOptions));
  app.use(generalLimiter);
  app.use(clerkMiddleware());

  app.get("/", (req, res) => res.send("Server is Live!"));
  app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));
  app.get("/ready", (req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready" });
  });
  app.use("/api/inngest", serve({ client: inngest, functions }));
  app.use("/api/show", showRouter);
  app.use("/api/booking/create", bookingLimiter);
  app.use("/api/booking", bookingRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/user", userRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export default createApp;
