import { jest } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

const stripeMock = {
  checkout: { sessions: { create: jest.fn(), expire: jest.fn(), retrieve: jest.fn() } },
  refunds: { create: jest.fn() },
  webhooks: { constructEvent: jest.fn() },
};
let currentUserId = "user_test";

jest.unstable_mockModule("stripe", () => ({
  default: jest.fn(() => stripeMock),
}));
jest.unstable_mockModule("@clerk/express", () => ({
  clerkMiddleware: () => (req, res, next) => {
    req.auth = () => ({
      userId: req.headers.authorization?.replace("Bearer ", "") || currentUserId,
    });
    next();
  },
  clerkClient: { users: { getUser: jest.fn() } },
}));
jest.unstable_mockModule("inngest/express", () => ({
  serve: () => (req, res) => res.status(200).json({}),
}));

process.env.STRIPE_SECRET_KEY = "sk_test_mock";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_mock";

const { default: createApp } = await import("../app.js");
const { default: Booking } = await import("../models/Booking.js");
const { default: Movie } = await import("../models/Movie.js");
const { default: Show } = await import("../models/Show.js");
const { default: ProcessedStripeEvent } = await import(
  "../models/ProcessedStripeEvent.js"
);
const { inngest, expirePendingBooking } = await import("../inngest/index.js");

const app = createApp();
let mongoServer;

const createMovieAndShow = async (showPriceCents = 1250) => {
  const movie = await Movie.create({
    _id: new mongoose.Types.ObjectId().toString(),
    title: "Test Movie",
    overview: "Test overview",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    release_date: "2026-01-01",
    genres: [],
    casts: [],
    vote_average: 8,
    runtime: 120,
  });
  return Show.create({
    movie: movie._id,
    showDateTime: new Date("2026-12-01T18:00:00.000Z"),
    showPriceCents,
  });
};

const checkoutEvent = (id, bookingId) => ({
  id,
  type: "checkout.session.completed",
  data: {
    object: {
      id: `cs_${id}`,
      payment_status: "paid",
      payment_intent: `pi_${id}`,
      metadata: { bookingId: bookingId.toString() },
    },
  },
});

const immediateStep = {
  run: jest.fn((name, callback) => callback()),
};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

beforeEach(() => {
  jest.clearAllMocks();
  currentUserId = `user_test_${Date.now()}_${Math.random()}`;
  process.env.BOOKING_RATE_LIMIT_MAX = "200";
  stripeMock.checkout.sessions.create.mockResolvedValue({
    id: "cs_test",
    url: "https://checkout.stripe.test/session",
  });
  inngest.send = jest.fn().mockResolvedValue({ ids: ["event_test"] });
});

afterEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe("booking seat reservations", () => {
  test("allows exactly one of 100 concurrent requests for the same seat when the limiter is raised", async () => {
    const show = await createMovieAndShow();
    const responses = await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        request(app)
          .post("/api/booking/create")
          .set("Origin", "http://localhost:5173")
          .set("Authorization", `Bearer race_user_${index}`)
          .send({ showId: show._id.toString(), selectedSeats: ["A1"] }),
      ),
    );

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(99);
    const storedShow = await Show.findById(show._id);
    expect(storedShow.occupiedSeats).toEqual({ A1: expect.anything() });
  });

  test("does not leave partial seats occupied when overlapping requests race", async () => {
    const show = await createMovieAndShow();
    const [first, second] = await Promise.all([
      request(app)
        .post("/api/booking/create")
        .set("Origin", "http://localhost:5173")
        .send({ showId: show._id.toString(), selectedSeats: ["A1", "A2"] }),
      request(app)
        .post("/api/booking/create")
        .set("Origin", "http://localhost:5173")
        .send({ showId: show._id.toString(), selectedSeats: ["A2", "A3"] }),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const occupiedSeats = Object.keys((await Show.findById(show._id)).occupiedSeats).sort();
    expect([["A1", "A2"], ["A2", "A3"]]).toContainEqual(occupiedSeats);
  });

  test("sends Stripe integer cents with the selected seat quantity", async () => {
    const show = await createMovieAndShow(1250);
    await request(app)
      .post("/api/booking/create")
      .set("Origin", "http://localhost:5173")
      .send({ showId: show._id.toString(), selectedSeats: ["A1", "A2", "A3"] })
      .expect(200);

    const lineItem = stripeMock.checkout.sessions.create.mock.calls[0][0].line_items[0];
    expect(lineItem.price_data.unit_amount).toBe(1250);
    expect(lineItem.quantity).toBe(3);
  });

  test("returns 429 after the authenticated user's booking limit is exceeded", async () => {
    process.env.BOOKING_RATE_LIMIT_MAX = "1";
    const show = await createMovieAndShow();

    await request(app)
      .post("/api/booking/create")
      .set("Origin", "http://localhost:5173")
      .send({ showId: show._id.toString(), selectedSeats: ["A1"] })
      .expect(200);

    const response = await request(app)
      .post("/api/booking/create")
      .set("Origin", "http://localhost:5173")
      .send({ showId: show._id.toString(), selectedSeats: ["A2"] })
      .expect(429);

    expect(response.body.error.code).toBe("BOOKING_RATE_LIMITED");
  });

  test("returns 429 when a user already has two unexpired pending holds", async () => {
    const show = await createMovieAndShow();
    await Booking.create([
      {
        user: currentUserId,
        show: show._id,
        amountCents: 1250,
        bookedSeats: ["A1"],
        holdExpiresAt: new Date(Date.now() + 60_000),
      },
      {
        user: currentUserId,
        show: show._id,
        amountCents: 1250,
        bookedSeats: ["A2"],
        holdExpiresAt: new Date(Date.now() + 60_000),
      },
    ]);

    const response = await request(app)
      .post("/api/booking/create")
      .set("Origin", "http://localhost:5173")
      .send({ showId: show._id.toString(), selectedSeats: ["A3"] })
      .expect(429);

    expect(response.body.error.code).toBe("TOO_MANY_HOLDS");
  });
});

describe("booking pagination", () => {
  test("returns a bounded page and pagination metadata for a user's bookings", async () => {
    const show = await createMovieAndShow();
    await Booking.create([
      { user: currentUserId, show: show._id, amountCents: 1250, bookedSeats: ["A1"] },
      { user: currentUserId, show: show._id, amountCents: 1250, bookedSeats: ["A2"] },
      { user: currentUserId, show: show._id, amountCents: 1250, bookedSeats: ["A3"] },
    ]);

    const response = await request(app).get("/api/user/bookings?page=1&limit=2").expect(200);

    expect(response.body.bookings).toHaveLength(2);
    expect(response.body.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });
});

describe("Stripe webhooks", () => {
  test("processes the same paid checkout event once and queues one confirmation email", async () => {
    const show = await createMovieAndShow();
    const booking = await Booking.create({
      user: "user_test",
      show: show._id.toString(),
      amountCents: 1250,
      bookedSeats: ["A1"],
    });
    const event = checkoutEvent("evt_paid", booking._id);
    stripeMock.webhooks.constructEvent.mockReturnValue(event);

    await request(app).post("/api/stripe").set("Stripe-Signature", "valid").send({}).expect(200);
    await request(app).post("/api/stripe").set("Stripe-Signature", "valid").send({}).expect(200);

    expect((await Booking.findById(booking._id)).status).toBe("paid");
    expect(inngest.send).toHaveBeenCalledTimes(1);
    expect(await ProcessedStripeEvent.countDocuments({ eventId: event.id })).toBe(1);
  });

  test("rejects an invalid Stripe signature", async () => {
    stripeMock.webhooks.constructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    await request(app).post("/api/stripe").set("Stripe-Signature", "invalid").send({}).expect(400);
  });

  test("refunds a paid checkout event that arrives after booking expiry", async () => {
    const show = await createMovieAndShow();
    const booking = await Booking.create({
      user: "user_test",
      show: show._id.toString(),
      amountCents: 1250,
      bookedSeats: ["A1"],
      status: "expired",
    });
    stripeMock.webhooks.constructEvent.mockReturnValue(checkoutEvent("evt_late", booking._id));
    stripeMock.refunds.create.mockResolvedValue({ id: "re_late" });

    await request(app).post("/api/stripe").set("Stripe-Signature", "valid").send({}).expect(200);

    expect(stripeMock.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_evt_late" },
      { idempotencyKey: "late-payment-refund-pi_evt_late" },
    );
    expect((await Booking.findById(booking._id)).status).toBe("refunded");
  });
});

describe("pending booking expiry", () => {
  test("expires an unpaid booking and frees only its held seats", async () => {
    const show = await createMovieAndShow();
    const booking = await Booking.create({
      user: "user_test",
      show: show._id.toString(),
      amountCents: 1250,
      bookedSeats: ["A1"],
      stripeSessionId: "cs_expire",
    });
    await Show.updateOne({ _id: show._id }, { $set: { "occupiedSeats.A1": booking._id } });
    stripeMock.checkout.sessions.expire.mockResolvedValue({ status: "expired" });

    await expirePendingBooking({ bookingId: booking._id.toString(), step: immediateStep });

    expect((await Booking.findById(booking._id)).status).toBe("expired");
    expect((await Show.findById(show._id)).occupiedSeats).toEqual({});
  });

  test("does nothing for a paid booking", async () => {
    const show = await createMovieAndShow();
    const booking = await Booking.create({
      user: "user_test",
      show: show._id.toString(),
      amountCents: 1250,
      bookedSeats: ["A1"],
      status: "paid",
      stripeSessionId: "cs_paid",
    });

    await expirePendingBooking({ bookingId: booking._id.toString(), step: immediateStep });

    expect(stripeMock.checkout.sessions.expire).not.toHaveBeenCalled();
    expect((await Booking.findById(booking._id)).status).toBe("paid");
  });

  test("keeps seats held when Stripe reports the checkout session is complete", async () => {
    const show = await createMovieAndShow();
    const booking = await Booking.create({
      user: "user_test",
      show: show._id.toString(),
      amountCents: 1250,
      bookedSeats: ["A1"],
      stripeSessionId: "cs_complete",
    });
    await Show.updateOne({ _id: show._id }, { $set: { "occupiedSeats.A1": booking._id } });
    stripeMock.checkout.sessions.expire.mockRejectedValue(new Error("already complete"));
    stripeMock.checkout.sessions.retrieve.mockResolvedValue({ status: "complete" });

    await expirePendingBooking({ bookingId: booking._id.toString(), step: immediateStep });

    expect((await Booking.findById(booking._id)).status).toBe("pending");
    expect((await Show.findById(show._id)).occupiedSeats).toEqual({ A1: expect.anything() });
  });
});
