import Booking from "../models/Booking.js";

export const allowedTransitions = {
  pending: ["paid", "expired", "cancelled"],
  paid: ["refunded"],
};

export const transition = async (bookingId, from, to, extraFields = {}) => {
  if (!allowedTransitions[from]?.includes(to)) {
    throw new Error(`Invalid booking transition: ${from} -> ${to}`);
  }

  return Booking.findOneAndUpdate(
    { _id: bookingId, status: from },
    { $set: { status: to, ...extraFields } },
    { new: true },
  );
};
