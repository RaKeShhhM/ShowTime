import crypto from "node:crypto";
import * as Sentry from "@sentry/node";
import pino from "pino";
import pinoHttp from "pino-http";

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['stripe-signature']",
      "authorization",
      "cookie",
      "['stripe-signature']",
    ],
    censor: "[REDACTED]",
  },
});

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const requestId = req.headers["x-request-id"] || crypto.randomUUID();
    res.setHeader("x-request-id", requestId);
    return requestId;
  },
  customProps: (req) => ({ requestId: req.id }),
});

export const sentryEnabled = Boolean(process.env.SENTRY_DSN);

if (sentryEnabled) {
  Sentry.init({ dsn: process.env.SENTRY_DSN });
}

export const captureException = (error) => {
  if (sentryEnabled) Sentry.captureException(error);
};
