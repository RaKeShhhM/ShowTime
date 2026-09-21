import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import User from "../models/User.js";
import { getPagination } from "../utils/pagination.js";

// API to check if user is an admin
export const isAdmin = async (req, res) => {
  res.json({ success: true, isAdmin: true });
};

// API to get dashboard data
export const getDashboardData = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ status: "paid" });
    const activeShows = await Show.find({
      showDateTime: { $gte: new Date() },
    }).populate("movie");

    const totalUser = await User.countDocuments();

    const dashboardData = {
      totalBookings: bookings.length,
      totalRevenueCents: bookings.reduce((acc, booking) => acc + booking.amountCents, 0),
      activeShows,
      totalUser,
    };

    res.json({ success: true, dashboardData });
  } catch (error) {
    next(error);
  }
};

// API to get all shows
export const getAllShows = async (req, res, next) => {
  try {
    const shows = await Show.find({ showDateTime: { $gte: new Date() } })
      .populate("movie")
      .sort({ showDateTime: 1 });

    res.json({ success: true, shows });
  } catch (error) {
    next(error);
  }
};

// API to get all bookings
export const getAllBookings = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const [bookings, total] = await Promise.all([
      Booking.find({})
        .select("user show amountCents bookedSeats status createdAt")
        .populate({ path: "user", select: "name" })
        .populate({
          path: "show",
          select: "movie showDateTime",
          populate: { path: "movie", select: "title" },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Booking.countDocuments(),
    ]);

    res.json({
      success: true,
      bookings,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};
