import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../server/package.json", import.meta.url));
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: fileURLToPath(new URL("../server/.env", import.meta.url)) });

const toCents = (amount) => {
  const cents = Math.round(Number(amount) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
};

const migrateCollection = async (collectionName, oldField, centsField) => {
  const collection = mongoose.connection.db.collection(collectionName);
  const documents = await collection
    .find({ [centsField]: { $exists: false }, [oldField]: { $exists: true } })
    .toArray();

  const operations = documents
    .map((document) => {
      const cents = toCents(document[oldField]);
      if (cents === null) return null;
      return {
        updateOne: {
          filter: { _id: document._id, [centsField]: { $exists: false } },
          update: { $set: { [centsField]: cents }, $unset: { [oldField]: "" } },
        },
      };
    })
    .filter(Boolean);

  if (operations.length) await collection.bulkWrite(operations);
  process.stdout.write(`${collectionName}: migrated ${operations.length} document(s)\n`);
};

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");

try {
  await mongoose.connect(`${process.env.MONGODB_URI}/quickshow`);
  await migrateCollection("shows", "showPrice", "showPriceCents");
  await migrateCollection("bookings", "amount", "amountCents");
} finally {
  await mongoose.disconnect();
}
