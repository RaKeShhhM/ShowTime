import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    user: { type: String, required: true, ref: "User" },
    show: { type: String, required: true, ref: "Show" },
    amountCents: { type: Number, required: true, min: 0 },
    bookedSeats: { type: Array, required: true },
    status: {
      type: String,
      enum: ["pending", "paid", "expired", "cancelled", "refunded"],
      default: "pending",
    },
    holdExpiresAt: { type: Date },
    stripeSessionId: { type: String },
    stripePaymentIntentId: { type: String },
    paymentLink: { type: String },
  },
  { timestamps: true }
);

// Supports newest-first booking history for one user.
bookingSchema.index({ user: 1, createdAt: -1 });
// Supports finding pending bookings whose seat holds have expired.
bookingSchema.index({ status: 1, holdExpiresAt: 1 });

const Booking = mongoose.model("Booking", bookingSchema);

export default Booking;
