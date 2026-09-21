import { clerkClient } from "@clerk/express";
import Booking from "../models/Booking.js";
import Movie from "../models/Movie.js";
import { getPagination } from "../utils/pagination.js";

// API Controller Function to Get User Bookings
export const getUserBookings = async (req, res, next) => {
  try {
    const user = req.auth().userId;

    const { page, limit, skip } = getPagination(req.query);
    const [bookings, total] = await Promise.all([
      Booking.find({ user })
        .select("show amountCents bookedSeats status paymentLink createdAt")
        .populate({
          path: "show",
          select: "movie showDateTime",
          populate: { path: "movie", select: "title poster_path runtime" },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Booking.countDocuments({ user }),
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

// API Controller Function to Update Favorite Movie in Clerk User Metadata
export const updateFavorite = async (req, res, next) => {
  try {
    const { movieId } = req.body;
    const userId = req.auth().userId;

    const user = await clerkClient.users.getUser(userId);

    if (!user.privateMetadata.favorites) {
      user.privateMetadata.favorites = [];
    }

    if (!user.privateMetadata.favorites.includes(movieId)) {
      user.privateMetadata.favorites.push(movieId);
    } else {
      user.privateMetadata.favorites = user.privateMetadata.favorites.filter(
        (item) => item !== movieId
      );
    }

    await clerkClient.users.updateUserMetadata(userId, {
      privateMetadata: user.privateMetadata,
    });

    res.json({ success: true, message: "Favorite movies updated" });
  } catch (error) {
    next(error);
  }
};

// API Controller Function to Get Favorite Movies from Clerk User Metadata
export const getFavorites = async (req, res, next) => {
  try {
    const user = await clerkClient.users.getUser(req.auth().userId);
    const favorites = user.privateMetadata.favorites;

    // Getting movies from database
    const movies = await Movie.find({ _id: { $in: favorites } });

    res.json({ success: true, movies });
  } catch (error) {
    next(error);
  }
};
