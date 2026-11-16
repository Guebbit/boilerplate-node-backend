/**
 * The read path under load: the storefront as an anonymous visitor sees it.
 *
 * Versus `npm run bench`: `hit.js` hammers one URL at a flat concurrency and reports numbers.
 *   This RAMPS, walks several endpoints, and asserts: `thresholds` turn "how fast is it" into a
 *   verdict the shell can act on, which is why both scripts exist.
 * Thresholds: placeholders you must replace. They sit where this API comfortably passes, because
 *   one invented before anything was measured is a wish, and a suite failing on day one is deleted
 *   on day two. Seed real ones: `npm run start` (or the compose stack), `npm run bench`, read the
 *   p95, set `p(95)` to roughly 1.4x it. A threshold catches a REGRESSION, not an ambition; without
 *   headroom it fires on an unlucky afternoon and teaches everyone to ignore it.
 * Not a gate: load depends on the machine. On a shared CI runner beside four other jobs it is
 *   noise, and a noisy gate is a disabled gate. Run it by hand against a stack you control, or
 *   nightly against a fixed environment.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 npm run bench:k6
 */
import http from 'k6/http';
import { check, group } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
    // Ramp up, hold, ramp down. The hold is where the numbers come from; the ramps exist so a
    // connection pool that only breaks under a rising edge has a chance to break.
    stages: [
        { duration: '20s', target: 20 },
        { duration: '40s', target: 20 },
        { duration: '10s', target: 0 }
    ],
    thresholds: {
        // p95, not average: an average hides the tail, and the tail is what a person notices.
        http_req_duration: ['p(95)<400'],
        // Anything non-2xx/3xx. A load test that quietly 500s while staying "fast" is worthless.
        http_req_failed: ['rate<0.01'],
        checks: ['rate>0.99']
    }
};

export default function () {
    group('catalogue', () => {
        const list = http.get(`${BASE_URL}/products`);
        check(list, {
            'list answers 200': (response) => response.status === 200,
            'list carries items': (response) => (response.json('items') || []).length > 0
        });

        // Follow through to a detail page, so this exercises the id lookup and its cache rather
        // than one endpoint's happy path repeated a thousand times.
        const first = list.json('items.0.id');
        if (first) {
            const detail = http.get(`${BASE_URL}/products/${first}`);
            check(detail, { 'detail answers 200': (response) => response.status === 200 });
        }
    });

    group('facets', () => {
        const facets = http.get(`${BASE_URL}/products/facets`);
        check(facets, { 'facets answer 200': (response) => response.status === 200 });
    });
}
