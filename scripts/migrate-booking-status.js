import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../server/package.json", import.meta.url));
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: fileURLToPath(new URL("../server/.env", import.meta.url)) });

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");

const cutoff = new Date(Date.now() - 10 * 60 * 1000);

try {
  await mongoose.connect(`${process.env.MONGODB_URI}/quickshow`);
  const bookings = mongoose.connection.db.collection("bookings");
  const legacyBookings = await bookings
    .find({ status: { $exists: false }, isPaid: { $exists: true } })
    .toArray();

  const operations = legacyBookings.map((booking) => {
    const createdAt = booking.createdAt || new Date();
    const holdExpiresAt = new Date(new Date(createdAt).getTime() + 10 * 60 * 1000);
    const status = booking.isPaid
      ? "paid"
      : new Date(createdAt) <= cutoff
        ? "expired"
        : "pending";

    return {
      updateOne: {
        filter: { _id: booking._id, status: { $exists: false } },
        update: {
          $set: { status, holdExpiresAt },
          $unset: { isPaid: "" },
        },
      },
    };
  });

  if (operations.length) await bookings.bulkWrite(operations);
  process.stdout.write(`Migrated ${operations.length} booking(s).\n`);
} finally {
  await mongoose.disconnect();
}
