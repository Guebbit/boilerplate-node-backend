/**
 * One URL, flat load — the quick "how fast is this endpoint" check behind `npm run bench`.
 *
 * `browse.js` and `checkout.js` ramp, walk a journey and assert; this just hammers one URL at a
 * constant number of virtual users and prints k6's summary (throughput, latency percentiles,
 * failed-request rate). No thresholds: it reports, it does not judge.
 *
 * Usage:
 *   npm run bench                       # GET /products
 *   npm run bench /orders               # any other path, same host
 *   TOKEN=<access token> npm run bench /orders
 *
 * Environment (passed through by the npm script):
 *   TARGET    the full URL to hit (the npm script builds it from NODE_PORT and the path)
 *   TOKEN     optional bearer token, for routes that need a session
 *   VUS       concurrent virtual users, default 20
 *   DURATION  how long, default 30s
 *
 * Lighter alternative: for a quick single-URL check with no container, `npx autocannon -c 20 -d 30
 * -l <url>` does the same job (https://github.com/mcollina/autocannon).
 */
import http from 'k6/http';
import { check } from 'k6';

const TARGET = __ENV.TARGET || 'http://localhost:3000/products';

const TOKEN = __ENV.TOKEN;

export const options = {
    // Constant VUs: every virtual user loops the request for the whole duration.
    vus: Number(__ENV.VUS) || 20,
    duration: __ENV.DURATION || '30s'
};

export default function () {
    const response = http.get(
        TARGET,
        TOKEN ? { headers: { Authorization: `Bearer ${TOKEN}` } } : {}
    );
    check(response, { 'answers 2xx': (r) => r.status >= 200 && r.status < 300 });
}
