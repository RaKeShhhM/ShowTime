import AppError from "../errors/AppError.js";
import { captureException, logger } from "../configs/observability.js";

const normalizeError = (error) => {
  if (error instanceof AppError) return error;
  if (error?.type === "entity.too.large") {
    return new AppError("Request body is too large.", 413, "PAYLOAD_TOO_LARGE");
  }
  if (error instanceof SyntaxError && "body" in error) {
    return new AppError("Malformed JSON request body.", 400, "INVALID_JSON");
  }
  if (error?.name === "ValidationError") {
    return new AppError("Request validation failed.", 400, "VALIDATION_ERROR");
  }
  if (error?.name === "CastError") {
    return new AppError("Invalid resource identifier.", 400, "INVALID_ID");
  }
  if (error?.code === 11000) {
    return new AppError("A conflicting resource already exists.", 409, "CONFLICT");
  }
  return new AppError("Internal server error.", 500, "INTERNAL_ERROR");
};

export const notFoundHandler = (req, res, next) =>
  next(new AppError("Route not found.", 404, "NOT_FOUND"));

export const errorHandler = (error, req, res, next) => {
  const appError = normalizeError(error);
  logger.error({ err: error, requestId: req.id, statusCode: appError.statusCode }, "Request failed");
  if (appError.statusCode >= 500) captureException(error);

  const message =
    appError.statusCode >= 500 && process.env.NODE_ENV === "production"
      ? "Internal server error."
      : appError.message;

  res.status(appError.statusCode).json({
    error: { code: appError.code, message },
  });
};
