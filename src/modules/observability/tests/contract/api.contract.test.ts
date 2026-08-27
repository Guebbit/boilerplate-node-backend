/**
 * Contract tests for /observability.
 *
 * This module was the only routed one without a contract suite, and the gap was not cosmetic:
 * its three JSON endpoints answer shapes NOTHING else in the repo produces — a health snapshot
 * assembled by hand in a controller, a metrics overview read out of the Prometheus registry by
 * metric NAME, and an audit page over a sibling's collection. Every other module's response comes
 * out of a serializer that a dozen other assertions already constrain; these three are built
 * field by field, which is exactly the code that drifts from a spec without anyone noticing.
 *
 * `toSatisfyApiSpec` is the point of each case. The bodies are asserted on only where a value
 * proves something the shape cannot — that the health snapshot reports the REAL connection state,
 * that the overview survives modules whose counters have never been touched, that the audit page
 * honours its filters.
 *
 * Two routes are deliberately not here, for reasons that are about the transport rather than the
 * contract:
 *
 *   - `GET /observability/events` is an SSE stream that never completes. Supertest resolves on
 *     response END, so a request to it hangs until the suite times out; its payload shape is
 *     `asyncapi.yaml`'s to pin, and `stream.test.ts` in the infrastructure suite drives it.
 *   - `GET /observability/metrics` answers Prometheus text guarded by a static credential. The
 *     403-shaped branches are asserted below; the 200 needs `NODE_METRICS_TOKEN` set for the
 *     process, which is an environment fact rather than a request one.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { connection } from '@infrastructure/runtime/database';

setupTestDb();

/**
 * Read the audit page until the emitted entry has landed in it.
 *
 * The sink is fire-and-forget BY CONTRACT — `audit-logs`' `record()` returns `void` and swallows
 * its own failures, so that a Mongo hiccup cannot turn a rejected login into a 500. There is
 * therefore nothing to await between emitting an entry and reading it back, and a single read
 * would be a race that passes on a fast machine. Polling is what that design costs a test; the
 * alternative — making the sink awaitable — would trade a real production property for a tidier
 * spec.
 */
const pollUntilAudited = async (bearer: string, query: string) => {
    for (let attempt = 0; attempt < 20; attempt++) {
        const response = await api()
            .get(`/observability/audit${query}`)
            .set('Authorization', bearer);
        if (response.body?.data?.items?.length > 0) return response;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('audit entry never reached GET /observability/audit');
};

describe('GET /observability/health', () => {
    it('matches the contract for an admin', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().get('/observability/health').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('reports the database state the process is actually in', async () => {
        /* `setupTestDb()` has connected, so this is the one assertion that would fail if the
         * snapshot ever stopped reading a live connection and started reporting a constant —
         * which is what a hard-coded 'ready' would look like to every shape check. */
        const { bearer } = await authenticateAs('admin');

        const response = await api().get('/observability/health').set('Authorization', bearer);

        expect(connection.readyState).toBe(1);
        expect(response.body.data.dependencies.database.status).toBe('ready');
    });

    it('describes cache and queue in the same words as the database', async () => {
        /* The point of one vocabulary: a reader does not need to know which of the three is a
         * document store and which is a broker to read the payload.
         *
         * WHICH value each reports is deliberately not asserted — that depends on the `.env` of
         * whoever is running the suite, and a test that demanded a reachable Redis would fail on a
         * laptop for a reason that has nothing to do with the contract. What must hold everywhere
         * is that all three speak the same four words, and that `status` is the honest fold of
         * them. `dependency-health.test.ts` pins the mapping itself, with the state controlled. */
        const { bearer } = await authenticateAs('admin');

        const response = await api().get('/observability/health').set('Authorization', bearer);

        const { dependencies, status } = response.body.data;
        const reported = [dependencies.database, dependencies.cache, dependencies.queue].map(
            (dependency: { status: string }) => dependency.status
        );

        for (const value of reported)
            expect(['ready', 'connecting', 'unavailable', 'disabled']).toContain(value);

        const serving = reported.every(
            (value: string) => value === 'ready' || value === 'disabled'
        );
        expect(status).toBe(serving ? 'ok' : 'degraded');
    });

    it('names the analytics provider AND whether it can deliver', async () => {
        /*
         * Two facts, and neither works alone. A bare boolean could not distinguish "PostHog is
         * unconfigured" from "this deployment uses Umami"; a bare name could not distinguish a
         * working provider from one that warned once at boot and has discarded every event since —
         * which is the most common analytics failure there is, on the endpoint whose stated job is
         * "which part is missing".
         */
        const { bearer } = await authenticateAs('admin');

        const response = await api().get('/observability/health').set('Authorization', bearer);

        const { analytics } = response.body.data.telemetry;
        expect(typeof analytics.provider).toBe('string');
        expect(typeof analytics.configured).toBe('boolean');
    });

    it('matches the error contract for a non-admin', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().get('/observability/health').set('Authorization', bearer);

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for an anonymous caller', async () => {
        const response = await api().get('/observability/health');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('GET /observability/metrics/overview', () => {
    it('matches the contract for an admin', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .get('/observability/metrics/overview')
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('answers a full shape even for counters no module in this build owns', async () => {
        /* `readCounter` returns [] for an absent metric and the overview reports zero for that
         * row — which is what lets this module survive the deletion of the domains it reports on.
         * The contract requires the keys either way, so their absence would be a 500, not a
         * smaller body. */
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .get('/observability/metrics/overview')
            .set('Authorization', bearer);

        expect(typeof response.body.data.http.totalRequests).toBe('number');
        /* `auth.*` and `business.*` are the rows read out of counters `account`, `cart` and
         * `orders` own. In this suite nothing has checked out, so `checkoutSuccess` is a zero the
         * overview REPORTS rather than a key it omits — the difference between a dashboard that
         * survives a deleted module and one that 500s on it. */
        expect(response.body.data.auth.loginSuccess).toBeGreaterThan(0);
        expect(response.body.data.business.checkoutSuccess).toBe(0);
    });

    it('matches the error contract for a non-admin', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .get('/observability/metrics/overview')
            .set('Authorization', bearer);

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });
});

describe('GET /observability/audit', () => {
    it('matches the contract for an empty log', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().get('/observability/audit').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract for a log holding rows, narrowed by outcome', async () => {
        const { bearer } = await authenticateAs('admin');
        /*
         * A REAL failed login rather than a synthetic entry. `account/audit.ts` owns `auth.login`,
         * and `outcome: 'failure'` is what this filter narrows by — a test that drives the
         * endpoint that emits is worth more than one that writes the row it then reads.
         */
        await api().post('/account/login').send({ email: 'nobody@example.com', password: 'wrong' });

        const response = await pollUntilAudited(bearer, '?outcome=failure&pageSize=10');

        expect(response.status).toBe(200);
        expect(response.body.data.items.length).toBeGreaterThan(0);
        for (const entry of response.body.data.items) expect(entry.outcome).toBe('failure');
        // The page's own meta, not a bare count: `totalItems` is every failure matching the
        // filter, and `totalPages` is how many requests reach the rest of them.
        expect(response.body.data.meta.totalItems).toBeGreaterThan(0);
        expect(response.body.data.meta.pageSize).toBe(10);
        expect(response).toSatisfyApiSpec();
    });

    it('refuses a page size the contract does not allow', async () => {
        // `maximum: 100`, answered with a 422 rather than a quietly smaller page — this endpoint
        // pages, so an out-of-range page size is a broken request like anywhere else.
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .get('/observability/audit?pageSize=5000')
            .set('Authorization', bearer);

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for an unparseable `since`', async () => {
        /* The one input this endpoint validates itself: a bad date reaching Mongo as `Invalid
         * Date` filters nothing rather than erroring, so the page would look complete and be
         * wrong. */
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .get('/observability/audit?since=yesterday')
            .set('Authorization', bearer);

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a non-admin', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().get('/observability/audit').set('Authorization', bearer);

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });
});
