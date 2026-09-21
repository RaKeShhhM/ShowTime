import { inngest } from "../inngest/index.js";
import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import stripe from "stripe";
import { transition } from "../services/bookingStateMachine.js";
import {
  reserveSeats,
  releaseSeats,
  SeatUnavailableError,
  InvalidSeatSelectionError,
  getOccupiedSeatIds,
  validateSeatIds,
} from "../services/seatReservationService.js";

export const createBooking = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { showId, selectedSeats } = req.body;
    const { origin } = req.headers;

    validateSeatIds(selectedSeats);

    // Get the show details
    const showData = await Show.findById(showId).populate("movie");
    if (!showData) {
      return res.status(404).json({ success: false, message: "Show not found." });
    }
    const holdExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Create a new booking
    const booking = await Booking.create({
      user: userId,
      show: showId,
      amountCents: showData.showPriceCents * selectedSeats.length,
      bookedSeats: selectedSeats,
      holdExpiresAt,
    });

    try {
      await reserveSeats(showId, selectedSeats, booking._id);
    } catch (error) {
      await transition(booking._id, "pending", "cancelled");
      if (error instanceof SeatUnavailableError) {
        return res.status(409).json({ success: false, message: error.message });
      }
      throw error;
    }

    // Stripe Gateway Initialize
    const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);

    // Creating line items for Stripe
    const line_items = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: showData.movie.title,
          },
          unit_amount: showData.showPriceCents,
        },
        quantity: selectedSeats.length,
      },
    ];

    let session;
    try {
      session = await stripeInstance.checkout.sessions.create({
        success_url: `${origin}/loading/my-bookings`,
        cancel_url: `${origin}/my-bookings`,
        line_items: line_items,
        mode: "payment",
        metadata: {
          bookingId: booking._id.toString(),
        },
        expires_at: Math.floor(holdExpiresAt.getTime() / 1000),
      });
    } catch (error) {
      try {
        await releaseSeats(showId, selectedSeats, booking._id);
      } finally {
        await transition(booking._id, "pending", "cancelled");
      }
      throw error;
    }

    booking.paymentLink = session.url;
    booking.stripeSessionId = session.id;
    await booking.save();

    // Run Inngest Scheduler Function to check payment status after 10 minutes
    // Wrapped in try/catch — fails silently if Inngest dev server is not running locally
    try {
      await inngest.send({
        name: "app/checkpayment",
        data: {
          bookingId: booking._id.toString(),
          holdExpiresAt: holdExpiresAt.toISOString(),
        },
      });
    } catch (inngestError) {
      console.warn("[Inngest] Could not send event (dev server may not be running):", inngestError.message);
    }

    res.json({ success: true, url: session.url });
  } catch (error) {
    console.log(error.message);
    if (error instanceof InvalidSeatSelectionError) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.json({ success: false, message: error.message });
  }
};

export const getOccupiedSeats = async (req, res) => {
  try {
    const { showId } = req.params;
    const occupiedSeats = await getOccupiedSeatIds(showId);
    if (!occupiedSeats) {
      return res.status(404).json({ success: false, message: "Show not found." });
    }

    res.json({ success: true, occupiedSeats });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};
