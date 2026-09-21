# ShowTime

ShowTime is a full-stack movie ticket booking application. Browse upcoming movies, choose a showtime, select available seats, and complete checkout with Stripe. An administrator dashboard provides show, booking, and revenue management.

Built with React, Vite, Tailwind CSS, Express, MongoDB, Clerk, Stripe, TMDB, and Inngest.

## Highlights

- Browse current and upcoming movie shows powered by TMDB metadata
- View movie details, trailers, showtimes, and seat availability
- Reserve seats and continue to Stripe Checkout
- See current and unpaid bookings in a personal booking history
- Save favourite movies
- Role-protected admin dashboard for adding shows and reviewing bookings
- Stripe webhook handling for payment confirmation and confirmation emails
- Inngest jobs to sync Clerk users and release unpaid reservations

## Tech stack

| Layer | Technologies |
| --- | --- |
| Client | React 19, Vite, React Router, Tailwind CSS, Axios, Clerk |
| Server | Node.js, Express 5, Mongoose |
| Services | MongoDB, Clerk, Stripe, TMDB, Inngest, Nodemailer |

## Project structure

```text
ShowTime/
├── client/                 # React single-page application
│   ├── src/components/     # Shared UI and admin components
│   ├── src/context/        # Application state and API client
│   ├── src/pages/          # Customer and admin views
│   └── src/lib/            # Formatting helpers
├── server/                 # Express API
│   ├── controllers/        # Booking, show, admin, and webhook logic
│   ├── models/             # MongoDB schemas
│   ├── routes/             # API route definitions
│   ├── middleware/         # Clerk-based admin guard
│   └── inngest/            # Background event handlers
└── README.md
```

## Prerequisites

- Node.js 18 or newer
- MongoDB (local or Atlas)
- A [Clerk](https://clerk.com/) application
- A [Stripe](https://stripe.com/) account and webhook endpoint for payment confirmation
- A [TMDB](https://www.themoviedb.org/documentation/api) API key
- SMTP credentials for booking emails
- Optional: an [Inngest](https://www.inngest.com/) account or local dev server for background jobs

## Getting started

### 1. Install dependencies

```bash
git clone <your-repository-url>
cd ShowTime

cd server
npm install

cd ../client
npm install
```

### 2. Configure environment variables

Create `server/.env`:

```env
# The app appends /quickshow to this value. Do not include the database name.
MONGODB_URI=mongodb://127.0.0.1:27017

# Clerk server credentials
CLERK_SECRET_KEY=<your_clerk_secret_key>

# Movie data
TMDB_API_KEY=your_tmdb_api_key

# Payments
STRIPE_SECRET_KEY=<your_stripe_secret_key>
STRIPE_WEBHOOK_SECRET=<your_stripe_webhook_secret>

# Email notifications
SENDER_EMAIL=no-reply@example.com
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
```

Create `client/.env`:

```env
VITE_CLERK_PUBLISHABLE_KEY=<your_clerk_publishable_key>
VITE_BASE_URL=http://localhost:3000
VITE_TMDB_IMAGE_BASE_URL=https://image.tmdb.org/t/p/original
VITE_CURRENCY=$
```

Never commit either `.env` file. They are already ignored by Git.

### 3. Run the application

Open two terminals from the project root.

```bash
# Terminal 1 — API server
cd server
npm run server
```

```bash
# Terminal 2 — web client
cd client
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API runs at `http://localhost:3000`.

### 4. Configure local webhooks and jobs

Stripe must be able to send `payment_intent.succeeded` events to the API. For local development, forward events with the Stripe CLI:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe
```

Copy the displayed webhook signing secret into `STRIPE_WEBHOOK_SECRET`.

To exercise the Inngest functions locally, start the Inngest dev server while the API is running:

```bash
npx inngest-cli@latest dev
```

The API exposes the handler at `http://localhost:3000/api/inngest`.

## Admin access

Admin pages are available under `/admin`. Access is granted when the signed-in Clerk user has this private metadata:

```json
{
  "role": "admin"
}
```

Set it from the Clerk Dashboard for the relevant user, then refresh the application.

## API reference

All endpoints return JSON. Admin endpoints require a signed-in Clerk user whose private metadata role is `admin`.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/show/all` | Public | List upcoming movies with scheduled shows |
| `GET` | `/api/show/:movieId` | Public | Get movie details and available showtimes |
| `GET` | `/api/show/now-playing` | Admin | Get TMDB now-playing movies for show creation |
| `POST` | `/api/show/add` | Admin | Create one or more showtimes |
| `GET` | `/api/booking/seats/:showId` | Public | Get occupied seats for a show |
| `POST` | `/api/booking/create` | Clerk session | Create a pending booking and Stripe Checkout session |
| `GET` | `/api/user/bookings` | Clerk session | Get the current user's bookings |
| `GET` | `/api/user/favorites` | Clerk session | Get favourite movies |
| `POST` | `/api/user/update-favorite` | Clerk session | Add or remove a favourite movie |
| `GET` | `/api/admin/dashboard` | Admin | Get booking, user, revenue, and show totals |
| `GET` | `/api/admin/all-shows` | Admin | List upcoming shows |
| `GET` | `/api/admin/all-bookings` | Admin | List all bookings |
| `POST` | `/api/stripe` | Stripe | Receive and verify payment webhooks |

## Booking lifecycle

1. The client requests a seat reservation with a show ID and selected seats.
2. The server confirms those seats are free, creates a pending booking, and marks the seats occupied.
3. The customer is redirected to Stripe Checkout.
4. Stripe calls `/api/stripe` after successful payment; the booking is marked paid and a confirmation email is sent.
5. An Inngest job releases the seats and removes an unpaid booking after ten minutes.

## Available scripts

| Location | Command | Description |
| --- | --- | --- |
| `client` | `npm run dev` | Start the Vite development server |
| `client` | `npm run build` | Create a production client build |
| `client` | `npm run lint` | Run ESLint |
| `client` | `npm run preview` | Serve the production build locally |
| `server` | `npm run server` | Start Express with Nodemon |
| `server` | `npm start` | Start Express with Node.js |

## Contributing

1. Create a branch for your change.
2. Keep client and server configuration secrets out of commits.
3. Run the relevant lint/build checks before opening a pull request.
4. Include a concise description of the behaviour changed and how to test it.

## License

No license is currently specified. Add one before distributing or reusing this project publicly.
