import http from "k6/http";
import { check } from "k6";

const baseUrl = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  vus: 200,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000"],
  },
};

export default function () {
  const response = http.get(`${baseUrl}/api/show/all`);
  check(response, { "shows list returns 200": (result) => result.status === 200 });
}
