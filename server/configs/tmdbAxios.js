import axios from "axios";
import axiosRetryPkg from "axios-retry";
import { logger } from "./observability.js";

// axios-retry v4 ships both a default and named export; use the function directly
const axiosRetry = axiosRetryPkg.default ?? axiosRetryPkg;

// Create a dedicated axios instance for TMDB with retry logic
const tmdbAxios = axios.create({
  timeout: 15000, // 15 second timeout per attempt
});

axiosRetry(tmdbAxios, {
  retries: 4, // Retry up to 4 times
  retryDelay: (retryCount) => {
    // Exponential backoff: 500ms → 1s → 2s → 4s + small jitter
    const base = Math.pow(2, retryCount) * 500;
    return base + Math.random() * 200;
  },
  retryCondition: (error) => {
    // Retry on network errors (ECONNRESET, ETIMEDOUT, etc.) or 5xx server errors
    const networkError =
      !error.response ||
      error.code === "ECONNRESET" ||
      error.code === "ETIMEDOUT" ||
      error.code === "ECONNABORTED" ||
      error.code === "ENOTFOUND";
    const serverError = error.response && error.response.status >= 500;
    return networkError || serverError;
  },
  onRetry: (retryCount, error) => {
    logger.warn({ retryCount, err: error }, "Retrying TMDB request");
  },
});

export default tmdbAxios;
