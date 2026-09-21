import stripe from "stripe";
import Booking from "../models/Booking.js";
import ProcessedStripeEvent from "../models/ProcessedStripeEvent.js";
import { inngest } from "../inngest/index.js";
import { transition } from "../services/bookingStateMachine.js";
import { releaseSeats } from "../services/seatReservationService.js";

const recordProcessedEvent = async (eventId) => {
  try {
    await ProcessedStripeEvent.create({ eventId });
  } catch (error) {
    // A concurrent retry may have recorded the same event after it was handled.
    if (error?.code !== 11000) throw error;
  }
};

const refundLatePayment = async (stripeInstance, bookingId, paymentIntentId) => {
  const expiredBooking = await Booking.exists({ _id: bookingId, status: "expired" });
  if (!expiredBooking) return false;

  await stripeInstance.refunds.create(
    { payment_intent: paymentIntentId },
    { idempotencyKey: `late-payment-refund-${paymentIntentId}` },
  );
  await transition(bookingId, "expired", "refunded", {
    paymentLink: "",
    stripePaymentIntentId: paymentIntentId,
  });
  return true;
};

export const stripeWebhooks = async (request, response) => {
  const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);
  const signature = request.headers["stripe-signature"];
  let event;

  try {
    event = stripeInstance.webhooks.constructEvent(
      request.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    return response.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    if (await ProcessedStripeEvent.exists({ eventId: event.id })) {
      return response.status(200).json({ received: true });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const bookingId = session.metadata?.bookingId;
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;

        if (session.payment_status !== "paid" || !bookingId || !paymentIntentId) {
          console.warn(
            `[Stripe] Ignoring checkout session ${session.id}: payment is not paid, bookingId is missing, or payment intent is missing.`,
          );
          break;
        }

        const booking = await transition(bookingId, "pending", "paid", {
          paymentLink: "",
          stripePaymentIntentId: paymentIntentId,
        });

        // The conditional transition is the idempotency gate for side effects.
        if (!booking) {
          if (await refundLatePayment(stripeInstance, bookingId, paymentIntentId)) {
            console.warn(`[Stripe] Refunded late payment for booking ${bookingId}.`);
          } else {
            console.log(`[Stripe] Booking ${bookingId} was already handled.`);
          }
          break;
        }

        try {
          await inngest.send({ name: "app/show.booked", data: { bookingId } });
        } catch (error) {
          // Inngest retries email delivery; inability to enqueue must not retry Stripe.
          console.warn("[Inngest] Could not queue confirmation email:", error.message);
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object;
        const bookingId = session.metadata?.bookingId;
        if (!bookingId) break;

        const booking = await transition(bookingId, "pending", "expired");
        if (booking) {
          await releaseSeats(booking.show, booking.bookedSeats, booking._id);
        }
        break;
      }

      default:
        console.log(`[Stripe] Unhandled event type: ${event.type}`);
    }

    // Store only after business handling succeeds, so failed work is retried by Stripe.
    await recordProcessedEvent(event.id);
    return response.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return response.status(500).send("Internal Server Error");
  }
};
