import mongoose from "mongoose";
import { logger } from "./observability.js";

const connectDB = async () => {
  mongoose.connection.once("connected", () => logger.info("Database connected"));
  await mongoose.connect(`${process.env.MONGODB_URI}/quickshow`);
};

export default connectDB;
