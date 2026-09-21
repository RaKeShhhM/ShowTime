import Show from "../models/Show.js";
import { emitSeatsUpdated } from "../realtime/seatUpdates.js";

const SEAT_ID_PATTERN = /^[A-Z][0-9]{1,2}$/;
const VALID_SEAT_IDS = new Set(
  Array.from({ length: 10 }, (_, rowIndex) =>
    Array.from(
      { length: 9 },
      (_, seatIndex) => `${String.fromCharCode(65 + rowIndex)}${seatIndex + 1}`,
    ),
  ).flat(),
);

export class SeatUnavailableError extends Error {
  constructor() {
    super("Selected seats are not available.");
    this.name = "SeatUnavailableError";
  }
}

export class InvalidSeatSelectionError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidSeatSelectionError";
  }
}

export const validateSeatIds = (seatIds) => {
  if (!Array.isArray(seatIds) || !seatIds.length || seatIds.length > 10) {
    throw new InvalidSeatSelectionError("Select between 1 and 10 seats.");
  }

  if (new Set(seatIds).size !== seatIds.length) {
    throw new InvalidSeatSelectionError("Duplicate seat selections are not allowed.");
  }

  if (
    seatIds.some(
      (seatId) =>
        typeof seatId !== "string" ||
        !SEAT_ID_PATTERN.test(seatId) ||
        !VALID_SEAT_IDS.has(seatId),
    )
  ) {
    throw new InvalidSeatSelectionError("One or more selected seats are invalid.");
  }
};

export const reserveSeats = async (showId, seatIds, bookingId) => {
  validateSeatIds(seatIds);

  const availableSeatFilters = Object.fromEntries(
    seatIds.map((seatId) => [`occupiedSeats.${seatId}`, { $exists: false }]),
  );
  const seatAssignments = Object.fromEntries(
    seatIds.map((seatId) => [`occupiedSeats.${seatId}`, bookingId]),
  );

  const result = await Show.updateOne(
    { _id: showId, ...availableSeatFilters },
    { $set: seatAssignments },
  );

  if (result.modifiedCount !== 1) throw new SeatUnavailableError();
  void emitSeatsUpdated(showId);
};

export const releaseSeats = async (showId, seatIds, bookingId) => {
  validateSeatIds(seatIds);

  const result = await Show.updateOne(
    { _id: showId },
    [
      {
        $set: {
          occupiedSeats: {
            $arrayToObject: {
              $filter: {
                input: { $objectToArray: { $ifNull: ["$occupiedSeats", {}] } },
                as: "seat",
                cond: {
                  $not: [
                    {
                      $and: [
                        { $in: ["$$seat.k", seatIds] },
                        { $eq: ["$$seat.v", bookingId] },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      },
    ],
  );

  if (result.modifiedCount === 1) void emitSeatsUpdated(showId);
};

export const getOccupiedSeatIds = async (showId) => {
  const show = await Show.findById(showId).select("occupiedSeats");
  return show ? Object.keys(show.occupiedSeats) : null;
};
