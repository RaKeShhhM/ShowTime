import * as Clerk from "@clerk/express";
import { Server } from "socket.io";
import { logger } from "../configs/observability.js";

let io;

const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!allowedOrigins.length && process.env.NODE_ENV !== "production") {
  allowedOrigins.push("http://localhost:5173");
}

export const initializeSocketServer = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Origin is not allowed"));
      },
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Unauthorized"));

    try {
      const claims = await Clerk.verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      socket.data.userId = claims.sub;
      next();
    } catch (error) {
      logger.warn({ err: error }, "Rejected unauthenticated socket connection");
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("show:join", (showId) => {
      if (typeof showId === "string" && /^[a-f\d]{24}$/i.test(showId)) {
        socket.join(`show:${showId}`);
      }
    });
    socket.on("show:leave", (showId) => socket.leave(`show:${showId}`));
  });

  return io;
};

export const getSocketServer = () => io;
