import tmdbAxios from "../configs/tmdbAxios.js";
import Movie from "../models/Movie.js";
import Show from "../models/Show.js";
import AppError from "../errors/AppError.js";
import { getOrSet } from "../services/tmdbCache.js";

const NOW_PLAYING_CACHE_TTL_MS = 5 * 60 * 1000;

// API to get now playing movies from TMDB API
export const getNowPlayingMovies = async (req, res, next) => {
  try {
    const movies = await getOrSet("now-playing", NOW_PLAYING_CACHE_TTL_MS, async () => {
      const { data } = await tmdbAxios.get(
        "https://api.themoviedb.org/3/movie/now_playing",
        {
          params: {
            api_key: process.env.TMDB_API_KEY,
            language: "en-US",
            page: 1,
          },
        },
      );
      return data.results;
    });
    res.json({ success: true, movies: movies });
  } catch (error) {
    next(error);
  }
};

// API to add a new show to the database
export const addShow = async (req, res, next) => {
  try {
    const { movieId, showsInput, showPriceCents } = req.body;

    if (!Number.isInteger(showPriceCents) || showPriceCents < 0) {
      throw new AppError("Show price must be a whole number of cents.", 400, "INVALID_SHOW_PRICE");
    }

    let movie = await Movie.findById(movieId);

    if (!movie) {
      // Fetch movie details and credits from TMDB API
      const [movieDetailsResponse, movieCreditsResponse] = await Promise.all([
        tmdbAxios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
          params: { api_key: process.env.TMDB_API_KEY, language: "en-US" },
        }),

        tmdbAxios.get(`https://api.themoviedb.org/3/movie/${movieId}/credits`, {
          params: { api_key: process.env.TMDB_API_KEY, language: "en-US" },
        }),
      ]);

      const movieApiData = movieDetailsResponse.data;
      const movieCreditsData = movieCreditsResponse.data;

      const movieDetails = {
        _id: movieId,
        title: movieApiData.title,
        overview: movieApiData.overview,
        poster_path: movieApiData.poster_path,
        backdrop_path: movieApiData.backdrop_path,
        genres: movieApiData.genres,
        casts: movieCreditsData.cast,
        release_date: movieApiData.release_date,
        original_language: movieApiData.original_language,
        tagline: movieApiData.tagline || "",
        vote_average: movieApiData.vote_average,
        runtime: movieApiData.runtime,
      };

      //   Add movie to the database
      movie = await Movie.create(movieDetails);
    }

    const showsToCreate = [];
    showsInput.forEach((show) => {
      const showDate = show.date;
      show.time.forEach((time) => {
        const dateTimeString = `${showDate}T${time}`;
        showsToCreate.push({
          movie: movieId,
          showDateTime: new Date(dateTimeString),
          showPriceCents,
          occupiedSeats: {}, // Initialize with empty object
        });
      });
    });

    if (showsToCreate.length > 0) {
      await Show.insertMany(showsToCreate);
    }

    res.json({ success: true, message: "Show Added successfully." });
  } catch (error) {
    next(error);
  }
};

// API to get all shows from the database (supports ?q, ?genre, ?year filters)
export const getShows = async (req, res, next) => {
  try {
    const { q, genre, year } = req.query;

    const shows = await Show.find({ showDateTime: { $gte: new Date() } })
      .populate("movie")
      .sort({ showDateTime: 1 });

    // Deduplicate by movie id
    const movieMap = new Map();
    for (const show of shows) {
      if (show.movie && !movieMap.has(String(show.movie._id))) {
        movieMap.set(String(show.movie._id), show.movie);
      }
    }
    let movies = Array.from(movieMap.values());

    // Apply server-side filters
    if (q) {
      const lower = q.toLowerCase();
      movies = movies.filter((m) => m.title?.toLowerCase().includes(lower));
    }
    if (genre) {
      movies = movies.filter((m) => m.genres?.some((g) => g.name === genre));
    }
    if (year) {
      movies = movies.filter((m) => m.release_date?.startsWith(String(year)));
    }

    res.json({ success: true, shows: movies });
  } catch (error) {
    next(error);
  }
};

// API to get a single show from the database
export const getShow = async (req, res, next) => {
  try {
    const { movieId } = req.params;
    // get all upcoming shows for the movie
    const shows = await Show.find({
      movie: movieId,
      showDateTime: { $gte: new Date() },
    });

    const movie = await Movie.findById(movieId);

    const dateTime = {};

    shows.forEach((show) => {
      const date = show.showDateTime.toISOString().split("T")[0];
      if (!dateTime[date]) {
        dateTime[date] = [];
      }

      dateTime[date].push({ time: show.showDateTime, showId: show._id });
    });

    res.json({ success: true, movie, dateTime });
  } catch (error) {
    next(error);
  }
};
