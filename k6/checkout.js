/**
 * The write path under load — log in, fill a cart, check out.
 *
 * THIS is the scenario worth having, and the reason k6 earns its place beside autocannon. A GET
 * flood measures how fast a cached read is. This measures the thing that can actually break under
 * concurrency: `reserveForOrder` taking a hold on stock while other virtual users are taking one
 * on the same product. `tests/integration/concurrency/cart-races.test.ts` proves that logic is
 * correct with two racing callers; this asks whether it stays correct, and acceptable, with fifty.
 *
 * ── Why every virtual user shares one account ────────────────────────────────────────────────
 * Deliberate, and it is the interesting part. The demo dataset has two accounts, so fifty users
 * checking out as the same customer is exactly the contention this is looking for. If you would
 * rather measure throughput than contention, sign each VU in as its own account — but then you are
 * measuring a different question, and the reservation logic stops being under test.
 *
 * ── State ────────────────────────────────────────────────────────────────────────────────────
 * This WRITES. It creates orders and moves stock, so point it at a throwaway database and re-seed
 * afterwards (`npm run db:seed:reset`). Never at anything you care about.
 *
 * Thresholds are placeholders — see `k6/browse.js` for how to seed real ones. Writes are slower
 * than reads and their ceiling is set higher here for that reason, not because they matter less.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 k6 run k6/checkout.js
 */
import http from 'k6/http';
import { check, group } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// The demo customer. Published in `db/demo/demo-data.json` as `credentials.user`, so this is not a
// secret and not a second copy of one — change it there, not here.
const EMAIL = __ENV.K6_EMAIL || 'gino@pino.it';
const PASSWORD = __ENV.K6_PASSWORD || 'password';

export const options = {
    stages: [
        { duration: '20s', target: 10 },
        { duration: '40s', target: 10 },
        { duration: '10s', target: 0 }
    ],
    thresholds: {
        http_req_duration: ['p(95)<800'],
        http_req_failed: ['rate<0.02'],
        checks: ['rate>0.95']
    }
};

/**
 * Sign in and return the bearer token.
 *
 * Per iteration rather than once in `setup()`: a token minted once and shared by every VU tests a
 * cache, not a login. This way the auth path carries its share of the load too.
 *
 * @returns the access token, or undefined when the login did not succeed
 */
const login = () => {
    const response = http.post(
        `${BASE_URL}/account/login`,
        JSON.stringify({ email: EMAIL, password: PASSWORD }),
        { headers: { 'Content-Type': 'application/json' } }
    );
    check(response, { 'login answers 200': (r) => r.status === 200 });
    return response.json('data.accessToken');
};

export default function () {
    const token = login();
    if (!token) return;

    const authed = {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    };

    group('fill the cart', () => {
        const list = http.get(`${BASE_URL}/products`);
        const productId = list.json('data.items.0.id');
        if (!productId) return;

        const added = http.post(
            `${BASE_URL}/cart/items`,
            JSON.stringify({ productId, quantity: 1 }),
            authed
        );
        check(added, { 'add to cart accepted': (r) => r.status === 200 || r.status === 201 });
    });

    group('check out', () => {
        const order = http.post(`${BASE_URL}/cart/checkout`, JSON.stringify({}), authed);
        /*
         * 409 is a PASS, not a failure. Under contention the API is supposed to refuse a checkout
         * it cannot cover — that refusal is the reservation logic working, and counting it as an
         * error would make the suite report a correctly-behaving API as broken.
         */
        check(order, {
            'checkout resolved': (r) => r.status === 200 || r.status === 201 || r.status === 409
        });
    });
}
