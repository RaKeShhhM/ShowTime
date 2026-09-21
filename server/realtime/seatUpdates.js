import Show from "../models/Show.js";
import { logger } from "../configs/observability.js";
import { getSocketServer } from "./socketServer.js";

export const emitSeatsUpdated = async (showId) => {
  try {
    const io = getSocketServer();
    if (!io) return;

    const show = await Show.findById(showId).select("occupiedSeats").lean();
    if (!show) return;

    io.to(`show:${showId}`).emit("seats:updated", {
      showId: String(showId),
      occupiedSeatIds: Object.keys(show.occupiedSeats || {}),
    });
  } catch (error) {
    logger.error({ err: error, showId }, "Could not broadcast seat update");
  }
};
