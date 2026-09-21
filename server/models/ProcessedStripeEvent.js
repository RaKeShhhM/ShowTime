import mongoose from "mongoose";

const processedStripeEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true },
);

processedStripeEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const ProcessedStripeEvent = mongoose.model(
  "ProcessedStripeEvent",
  processedStripeEventSchema,
);

export default ProcessedStripeEvent;
