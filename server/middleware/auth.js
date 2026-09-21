import { clerkClient } from "@clerk/express";
import AppError from "../errors/AppError.js";

export const protectAdmin = async (req, res, next) => {
  try {
    const { userId } = req.auth();

    const user = await clerkClient.users.getUser(userId);

    if (user.privateMetadata.role !== "admin") {
      return next(new AppError("Not authorized.", 403, "FORBIDDEN"));
    }

    next();
  } catch (error) {
    return next(new AppError("Not authorized.", 401, "UNAUTHORIZED"));
  }
};
