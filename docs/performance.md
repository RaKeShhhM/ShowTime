# Performance and load testing

The booking-list endpoints accept `page` and `limit` query parameters. They default to page `1` and limit `20`; the maximum limit is `100`.

Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) and run the scripts against a running instance. Use a non-production test show for the seat race, because its one successful request creates a real pending booking and Stripe Checkout session.

```bash
k6 run -e BASE_URL=http://localhost:3000 loadtest/browse-shows.js
```

For the booking race, provide a valid Clerk session token and an upcoming show ID. Do not add either value to source control.

```bash
k6 run -e BASE_URL=http://localhost:3000 -e AUTH_TOKEN=<token> -e SHOW_ID=<show_id> loadtest/same-seat-race.js
```

The race script starts 100 virtual users with the same seat selection and fails unless exactly one request succeeds. Conflicts (`409`) and rate-limited requests (`429`) are expected for the remaining attempts.

## Results

| Scenario | Throughput | p95 latency | Error rate | Notes |
| --- | --- | --- | --- | --- |
| 200 VU show browsing |  |  |  |  |
| 100 VU same-seat race |  |  |  |  |
