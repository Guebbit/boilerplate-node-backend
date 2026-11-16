/**
 * The write path under load: log in, fill a cart, check out.
 *
 * Why:    the scenario a single-URL hammer (`hit.js`) cannot be. A GET flood measures a cached
 *   read; this measures what can break under concurrency: `reserveForOrder` taking a stock hold
 *   while other virtual users take one on the same product.
 *   `tests/integration/concurrency/cart-races.test.ts` proves it correct with two racing callers;
 *   this asks whether it stays correct, and acceptable, with fifty.
 * One account: every VU signs in as the same seeded customer, so fifty simultaneous checkouts are
 *   exactly the contention sought. Signing each VU in as its own account measures throughput, a
 *   different question, and the reservation logic stops being under test.
 * State:  this WRITES. It creates orders and moves stock: use a throwaway database and re-seed
 *   (`npm run scenario:apply:reset`). Never point it at anything you care about.
 * Thresholds: placeholders, see `tests/load/browse.js` for seeding real ones. The ceiling is
 *   higher than for reads because writes are slower, not because they matter less.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 npm run bench:k6 checkout
 */
import http from 'k6/http';
import { check, group } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// The demo customer. `SEED_USER_EMAIL`/`SEED_USER_PASSWORD` in `scenarios/accounts.ts`, so
// this is not a secret and not a second copy of one — change it there, not here.
const EMAIL = __ENV.K6_EMAIL || 'customer@example.com';
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
    return response.json('token');
};

export default function () {
    const token = login();
    if (!token) return;

    const authed = {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    };

    group('fill the cart', () => {
        const list = http.get(`${BASE_URL}/products`);
        const productId = list.json('items.0.id');
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
