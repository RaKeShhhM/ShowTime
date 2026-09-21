# Performance and load testing

The booking-list endpoints accept `page` and `limit` query parameters. They default to page `1` and limit `20`; the maximum limit is `100`.

Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) and run the scripts against a running instance. Use a non-production test show for the seat race, because its one successful request creates a real pending booking and Stripe Checkout session.

```bash
k6 run -e BASE_URL=http://localhost:3000 loadtest/browse-shows.js
```

For the booking race, provide 100 valid Clerk session tokens and an upcoming show ID. Each k6 virtual user selects a token from the comma-separated `AUTH_TOKENS` value using its VU number and sends it as a normal Clerk Bearer token. There is no authentication bypass. Do not add tokens to source control.

Run the API with the booking limiter raised through environment variables only. This is appropriate for a controlled, non-production test environment. There is no runtime authentication bypass.

```bash
# Terminal 1: start the API with a higher, temporary booking limit.
BOOKING_RATE_LIMIT_MAX=200 BOOKING_RATE_LIMIT_WINDOW_MS=60000 npm start

# Terminal 2: run the race against that API.
k6 run -e BASE_URL=http://localhost:3000 -e AUTH_TOKENS=<100_comma_separated_tokens> -e SHOW_ID=<show_id> loadtest/same-seat-race.js
```

The race script starts 100 virtual users with the same seat selection and fails unless exactly one request succeeds. With the limiter raised, each remaining request must return the expected seat conflict (`409`); a `429` means the configured limit is still too low.

## Results

| Scenario | Throughput | p95 latency | Error rate | Notes |
| --- | --- | --- | --- | --- |
| 200 VU show browsing |  |  |  |  |
| 100 VU same-seat race |  |  |  |  |
