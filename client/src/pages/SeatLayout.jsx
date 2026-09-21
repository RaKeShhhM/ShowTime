import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { assets } from "../assets/assets";
import Loading from "../components/Loading";
import { ArrowRightIcon, ClockIcon } from "lucide-react";
import isoTimeFormat from "../lib/isoTimeFormat";
import BlurCircle from "../components/BlurCircle";
import toast from "react-hot-toast";
import { useAppContext } from "../context/AppContext";

const SeatLayout = () => {
  const groupRows = [
    ["A", "B"],
    ["C", "D"],
    ["E", "F"],
    ["G", "H"],
    ["I", "J"],
  ];

  const { id, date } = useParams();
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [selectedTime, setSelectedTime] = useState(null);
  const [show, setShow] = useState(null);
  const [occupiedSeats, setOccupiedSeats] = useState([]);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [holdExpiresAt, setHoldExpiresAt] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [heldSeatIds, setHeldSeatIds] = useState([]);
  const [isBookingSubmitting, setIsBookingSubmitting] = useState(false);

  const { axios, getToken, user } = useAppContext();

  const getShow = async () => {
    try {
      const { data } = await axios.get(`/api/show/${id}`);
      if (data.success) {
        setShow(data);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const handleSeatClick = (seatId) => {
    if (checkoutUrl) return toast("Your seats are already on hold");
    if (!selectedTime) {
      return toast("Please select time first");
    }
    if (!selectedSeats.includes(seatId) && selectedSeats.length > 9) {
      return toast("You can only select 10 seats");
    }
    if (occupiedSeats.includes(seatId)) {
      return toast("This seat is already booked");
    }
    setSelectedSeats((prev) =>
      prev.includes(seatId)
        ? prev.filter((seat) => seat !== seatId)
        : [...prev, seatId]
    );
  };

  const renderSeats = (row, count = 9) => (
    <div key={row} className="flex gap-2 mt-2">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {Array.from({ length: count }, (_, i) => {
          const seatId = `${row}${i + 1}`;
          return (
            <button
              key={seatId}
              onClick={() => handleSeatClick(seatId)}
              className={`h-8 w-8 rounded border border-primary/60 cursor-pointer ${
                selectedSeats.includes(seatId) && "bg-primary text-white"
              } ${occupiedSeats.includes(seatId) && "opacity-50"}`}
            >
              {seatId}
            </button>
          );
        })}
      </div>
    </div>
  );

  const getOccupiedSeats = useCallback(async (showId) => {
    try {
      const { data } = await axios.get(`/api/booking/seats/${showId}`);
      if (data.success) {
        setOccupiedSeats(data.occupiedSeats);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.log(error);
    }
  }, [axios]);

  const bookTickets = async () => {
    try {
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }
      if (!user) return toast.error("Please login to proceed");

      if (!selectedTime || !selectedSeats.length)
        return toast.error("Please select a time and seats");

      setIsBookingSubmitting(true);
      const { data } = await axios.post(
        "/api/booking/create",
        { showId: selectedTime.showId, selectedSeats },
        { headers: { Authorization: `Bearer ${await getToken()}` } }
      );

      if (data.success) {
        setHeldSeatIds(selectedSeats);
        setCheckoutUrl(data.url);
        setHoldExpiresAt(data.holdExpiresAt);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error(error.response?.data?.error?.message || error.message);
    } finally {
      setIsBookingSubmitting(false);
    }
  };

  useEffect(() => {
    getShow();
  }, []);

  useEffect(() => {
    if (selectedTime) {
      setSelectedSeats([]);
      setHeldSeatIds([]);
      setCheckoutUrl("");
      setHoldExpiresAt(null);
      getOccupiedSeats(selectedTime.showId);
    }
  }, [selectedTime, getOccupiedSeats]);

  useEffect(() => {
    if (!selectedTime || !user) return undefined;

    let socket;
    let cancelled = false;
    const connect = async () => {
      const token = await getToken();
      if (cancelled || !token) return;

      socket = io(import.meta.env.VITE_BASE_URL, { auth: { token } });
      socket.on("connect", () => {
        socket.emit("show:join", selectedTime.showId);
        getOccupiedSeats(selectedTime.showId);
      });
      socket.on("seats:updated", ({ showId, occupiedSeatIds }) => {
        if (showId !== selectedTime.showId) return;
        setOccupiedSeats(occupiedSeatIds);
        if (isBookingSubmitting) return;

        setSelectedSeats((previousSeats) => {
          const seatsTakenByOthers = previousSeats.filter(
            (seatId) => occupiedSeatIds.includes(seatId) && !heldSeatIds.includes(seatId),
          );
          if (seatsTakenByOthers.length) {
            toast.error("A selected seat was just taken by another customer.");
            return previousSeats.filter((seatId) => !seatsTakenByOthers.includes(seatId));
          }
          return previousSeats;
        });
      });
    };

    connect();
    return () => {
      cancelled = true;
      socket?.emit("show:leave", selectedTime.showId);
      socket?.disconnect();
    };
  }, [getOccupiedSeats, getToken, heldSeatIds, isBookingSubmitting, selectedTime, user]);

  useEffect(() => {
    if (!holdExpiresAt) return undefined;

    const updateCountdown = () => {
      const seconds = Math.max(0, Math.ceil((new Date(holdExpiresAt) - Date.now()) / 1000));
      setSecondsRemaining(seconds);
      if (seconds === 0) {
        setHoldExpiresAt(null);
        setCheckoutUrl("");
        setHeldSeatIds([]);
        setSelectedSeats([]);
        getOccupiedSeats(selectedTime.showId);
        toast.error("Your seat hold expired. Please choose seats again.");
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [getOccupiedSeats, holdExpiresAt, selectedTime]);

  const holdCountdown = `${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, "0")}`;

  return show ? (
    <div className="flex flex-col md:flex-row px-6 md:px-16 lg:px-40 py-30 md:pt-50">
      {/* Available Timings */}
      <div className="w-60 bg-primary/10 border border-primary/20 rounded-lg py-10 h-max md:sticky md:top-30">
        <p className="text-lg font-semibold px-6">Available Timings</p>
        <div className="mt-5 space-y-1">
          {show.dateTime[date].map((item) => (
            <div
              key={item.time}
              onClick={() => setSelectedTime(item)}
              className={`flex items-center gap-2 px-6 py-2 w-max rounded-r-md cursor-pointer transition ${
                selectedTime?.time === item.time
                  ? "bg-primary text-white"
                  : "hover:bg-primary/20"
              }`}
            >
              <ClockIcon className="w-4 h-4" />
              <p className="text-sm">{isoTimeFormat(item.time)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Seats Layout */}
      <div className="relative flex-1 flex flex-col items-center max-md:mt-16">
        <BlurCircle top="-100px" left="-100px" />
        <BlurCircle bottom="0" right="0" />
        <h1 className="text-2xl font-semibold mb-4">Select your seat</h1>
        <img src={assets.screenImage} alt="screen" />
        <p className="text-gray-400 text-sm mb-6">SCREEN SIDE</p>
        <div className="flex flex-col items-center mt-10 text-xs text-gray-300">
          <div className="grid grid-cols-2 md:grid-cols-1 gap-8 md:gap-2 mb-6">
            {groupRows[0].map((row) => renderSeats(row))}
          </div>
          <div className="grid grid-cols-2 gap-11">
            {groupRows.slice(1).map((group, idx) => (
              <div key={idx}>{group.map((row) => renderSeats(row))}</div>
            ))}
          </div>
        </div>

        <button
          onClick={bookTickets}
          disabled={isBookingSubmitting}
          className="flex items-center gap-1 mt-20 px-10 py-3 text-sm bg-primary hover:bg-primary-dull transition rounded-full font-medium cursor-pointer active:scale-95"
        >
          {checkoutUrl ? `Continue to Checkout (${holdCountdown})` : "Proceed to Checkout"}
          <ArrowRightIcon strokeWidth={3} className="w-4 h-4" />
        </button>
      </div>
    </div>
  ) : (
    <Loading />
  );
};

export default SeatLayout;
