/**
 * The read path under load — the storefront as an anonymous visitor sees it.
 *
 * WHAT THIS IS FOR, and how it differs from `npm run bench`. Autocannon hammers one URL at a flat
 * concurrency and reports numbers; this RAMPS, walks more than one endpoint, and — the part that
 * matters — asserts. `thresholds` below turn "how fast is it" into a verdict the shell can act on,
 * which is the whole reason to have both tools rather than one.
 *
 * ── The thresholds are placeholders and you must replace them ────────────────────────────────
 * They are set at values this API comfortably meets, on purpose: a threshold invented before
 * anything was measured is a wish, and a suite that fails on day one gets deleted on day two.
 * Seed real ones like this:
 *
 *   npm run start                     # or the compose stack
 *   npm run bench                     # read the p95 it reports
 *   # then set p(95) here to roughly 1.4x that number
 *
 * The multiplier is the point. The job of a threshold is to catch a REGRESSION, not to express an
 * ambition — leave headroom or it fires on an unlucky afternoon and teaches everyone to ignore it.
 *
 * ── Not a merge gate ─────────────────────────────────────────────────────────────────────────
 * Load results depend on the machine. On a shared CI runner alongside four other jobs they are
 * noise, and a noisy gate is a disabled gate. Run this by hand against a stack you control, or
 * nightly against a fixed environment.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 k6 run k6/browse.js
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
            'list carries items': (response) => (response.json('data.items') || []).length > 0
        });

        // Follow through to a detail page, so this exercises the id lookup and its cache rather
        // than one endpoint's happy path repeated a thousand times.
        const first = list.json('data.items.0.id');
        if (first) {
            const detail = http.get(`${BASE_URL}/products/${first}`);
            check(detail, { 'detail answers 200': (response) => response.status === 200 });
        }
    });

    group('facets', () => {
        const facets = http.get(`${BASE_URL}/products/categories`);
        check(facets, { 'facets answer 200': (response) => response.status === 200 });
    });
}
