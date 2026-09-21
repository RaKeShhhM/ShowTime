import stripe from "stripe";
import User from "../models/User.js";
import { inngest } from "../inngest/index.js";
import { sendEmail } from "../configs/nodeMailer.js";
import { clerkClient } from "@clerk/express";
import { transition } from "../services/bookingStateMachine.js";

export const stripeWebhooks = async (request, response) => {
  const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);
  const sig = request.headers["stripe-signature"];

  let event;

  try {
    event = stripeInstance.webhooks.constructEvent(
      request.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    return response.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;

        const sessionList = await stripeInstance.checkout.sessions.list({
          payment_intent: paymentIntent.id,
        });

        const session = sessionList.data[0];
        const { bookingId } = session.metadata;

        // Mark booking as paid and populate show/movie
        const booking = await transition(
          bookingId,
          "pending",
          "paid",
          { paymentLink: "", stripePaymentIntentId: paymentIntent.id },
        );

        if (!booking) break;

        await booking.populate({
          path: "show",
          populate: { path: "movie", model: "Movie" },
        });

        // Manually fetch user — Booking.user is a String (Clerk ID), not ObjectId
        // so Mongoose .populate("user") does NOT work here
        let user = await User.findById(booking.user);

        // Fallback: user not in MongoDB (Inngest sync may never have run)
        // Fetch directly from Clerk and save to DB for future use
        if (!user && booking?.user) {
          try {
            const clerkUser = await clerkClient.users.getUser(booking.user);
            const email = clerkUser.emailAddresses[0]?.emailAddress;
            const name =
              `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() ||
              "User";
            const image = clerkUser.imageUrl || "";
            // Save to DB so future lookups work
            user = await User.findOneAndUpdate(
              { _id: booking.user },
              { _id: booking.user, email, name, image },
              { upsert: true, new: true },
            );
            console.log(`[User] Synced from Clerk: ${email}`);
          } catch (clerkError) {
            console.warn(
              "[User] Could not fetch from Clerk:",
              clerkError.message,
            );
          }
        }

        // Send confirmation email directly
        if (user?.email) {
          try {
            await sendEmail({
              to: user.email,
              subject: `Booking Confirmed: "${booking.show.movie.title}" 🎬`,
              body: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 500px;">
                  <h2>Hi ${user.name},</h2>
                  <p>Your booking for <strong style="color: #F84565;">"${booking.show.movie.title}"</strong> is confirmed!</p>
                  <p>
                    <strong>Date:</strong> ${new Date(booking.show.showDateTime).toLocaleDateString("en-US")}<br/>
                    <strong>Time:</strong> ${new Date(booking.show.showDateTime).toLocaleTimeString("en-US")}<br/>
                    <strong>Seats:</strong> ${booking.bookedSeats.join(", ")}<br/>
                    <strong>Amount Paid:</strong> $${(booking.amountCents / 100).toFixed(2)}
                  </p>
                  <p>Enjoy the show! 🍿</p>
                  <p>Thanks for booking with <strong>ShowTime</strong>!</p>
                </div>
              `,
            });
            console.log(`[Email] Confirmation sent to ${user.email}`);
          } catch (emailError) {
            console.warn(
              "[Email] Failed to send confirmation:",
              emailError.message,
            );
          }
        } else {
          console.warn(
            "[Email] Skipped — user not found for booking:",
            bookingId,
          );
        }

        // Also trigger Inngest for extra automation (fails silently if not running)
        try {
          await inngest.send({ name: "app/show.booked", data: { bookingId } });
        } catch (inngestError) {
          console.warn("[Inngest] Could not send event:", inngestError.message);
        }

        break;
      }

      default:
        console.log("Unhandled event type:", event.type);
    }

    response.json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    response.status(500).send("Internal Server Error");
  }
};
