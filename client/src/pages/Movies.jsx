import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import BlurCircle from "../components/BlurCircle";
import MovieCard from "../components/MovieCard";
import Loading from "../components/Loading";
import { useAppContext } from "../context/AppContext";
import { SearchIcon, XIcon } from "lucide-react";

// All TMDB genres (static — no need to fetch)
const GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "History",
  "Horror",
  "Music",
  "Mystery",
  "Romance",
  "Science Fiction",
  "Thriller",
  "War",
  "Western",
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 30 }, (_, i) => currentYear - i);

const Movies = () => {
  const { axios } = useAppContext();
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive filter values from URL params
  const urlQ = searchParams.get("q") || "";
  const urlGenre = searchParams.get("genre") || "";
  const urlYear = searchParams.get("year") || "";

  // Local input state for debounce
  const [inputQ, setInputQ] = useState(urlQ);

  const [movies, setMovies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Debounce text input → update URL param after 400ms
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = {};
      if (inputQ) params.q = inputQ;
      if (urlGenre) params.genre = urlGenre;
      if (urlYear) params.year = urlYear;
      setSearchParams(params, { replace: true });
    }, 400);
    return () => clearTimeout(timer);
  }, [inputQ]);

  // Fetch from server whenever URL params change
  useEffect(() => {
    const fetchMovies = async () => {
      setIsLoading(true);
      try {
        const params = {};
        if (urlQ) params.q = urlQ;
        if (urlGenre) params.genre = urlGenre;
        if (urlYear) params.year = urlYear;

        const { data } = await axios.get("/api/show/all", { params });
        if (data.success) {
          setMovies(data.shows);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMovies();
  }, [urlQ, urlGenre, urlYear]);

  const setFilter = (key, value) => {
    const params = {};
    if (inputQ) params.q = inputQ;
    if (urlGenre) params.genre = urlGenre;
    if (urlYear) params.year = urlYear;
    if (value) params[key] = value;
    else delete params[key];
    setSearchParams(params, { replace: true });
  };

  const clearAll = () => {
    setInputQ("");
    setSearchParams({}, { replace: true });
  };

  const hasFilters = urlQ || urlGenre || urlYear;

  return (
    <div className="relative my-40 mb-60 px-6 md:px-16 lg:px-40 xl:px-44 overflow-hidden min-h-[80vh]">
      <BlurCircle top="150px" left="0" />
      <BlurCircle bottom="50px" right="50px" />

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 mb-8">
        {/* Row 1: Search — always full width */}
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 w-full">
          <SearchIcon className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            value={inputQ}
            onChange={(e) => setInputQ(e.target.value)}
            placeholder="Search by title..."
            className="bg-transparent text-white text-sm placeholder-gray-500 outline-none w-full"
          />
          {inputQ && (
            <XIcon
              className="w-4 h-4 text-gray-500 cursor-pointer hover:text-white transition shrink-0"
              onClick={() => setInputQ("")}
            />
          )}
        </div>

        {/* Row 2: Genre + Year + Clear */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Genre */}
          <select
            value={urlGenre}
            onChange={(e) => setFilter("genre", e.target.value)}
            className="flex-1 min-w-[130px] bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-gray-300 outline-none cursor-pointer hover:border-white/30 transition"
          >
            <option value="" className="bg-gray-900">
              All Genres
            </option>
            {GENRES.map((g) => (
              <option key={g} value={g} className="bg-gray-900">
                {g}
              </option>
            ))}
          </select>

          {/* Year */}
          <select
            value={urlYear}
            onChange={(e) => setFilter("year", e.target.value)}
            className="flex-1 min-w-[120px] bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-gray-300 outline-none cursor-pointer hover:border-white/30 transition"
          >
            <option value="" className="bg-gray-900">
              All Years
            </option>
            {YEARS.map((y) => (
              <option key={y} value={y} className="bg-gray-900">
                {y}
              </option>
            ))}
          </select>

          {/* Clear */}
          {hasFilters && (
            <button
              onClick={clearAll}
              className="px-4 py-2 text-sm text-primary border border-primary/40 rounded-full hover:bg-primary/10 transition cursor-pointer whitespace-nowrap"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Title + count */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-medium">
          {hasFilters ? "Search Results" : "Now Showing"}
        </h1>
        {!isLoading && (
          <span className="text-sm text-gray-500">
            {movies.length} {movies.length === 1 ? "movie" : "movies"}
          </span>
        )}
      </div>

      {/* Results */}
      {isLoading ? (
        <Loading />
      ) : movies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <p className="text-4xl">🎬</p>
          <p className="text-white font-semibold text-lg">No movies found</p>
          <p className="text-gray-500 text-sm">Try adjusting your filters.</p>
          {hasFilters && (
            <button
              onClick={clearAll}
              className="mt-2 px-5 py-2 text-sm bg-primary hover:bg-primary-dull transition rounded-full font-medium cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap max-sm:justify-center gap-8">
          {movies.map((movie) => (
            <MovieCard movie={movie} key={movie._id} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Movies;
