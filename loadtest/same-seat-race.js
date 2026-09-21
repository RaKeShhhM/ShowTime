import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://localhost:3000";
const authToken = __ENV.AUTH_TOKEN;
const showId = __ENV.SHOW_ID;
const seatId = __ENV.SEAT_ID || "A1";
const bookingSuccesses = new Counter("booking_successes");

if (!authToken || !showId) {
  throw new Error("AUTH_TOKEN and SHOW_ID are required.");
}

export const options = {
  scenarios: {
    same_seat: {
      executor: "shared-iterations",
      vus: 100,
      iterations: 100,
      maxDuration: "30s",
    },
  },
  thresholds: {
    booking_successes: ["count==1"],
    checks: ["rate==1"],
  },
};

export default function () {
  const response = http.post(
    `${baseUrl}/api/booking/create`,
    JSON.stringify({ showId, selectedSeats: [seatId] }),
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        Origin: __ENV.CLIENT_ORIGIN || "http://localhost:5173",
      },
    },
  );

  if (response.status === 200) bookingSuccesses.add(1);
  check(response, {
    "one valid booking outcome": (result) => [200, 409, 429].includes(result.status),
  });
}
