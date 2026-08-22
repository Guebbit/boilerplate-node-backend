/**
 * `src/infrastructure/http/middlewares/security.ts` — the two rate-limit budgets and the metrics scrape guard.
 *
 * `isMetricsScraper` is the substance here. It is the only credential check in the codebase that
 * does not go through the JWT middleware, because Prometheus cannot log in, and it protects an
 * endpoint whose body is a map of when the service is weakest. Three properties are asserted
 * separately because each one fails silently on its own:
 *
 *   - **deny by default.** With `NODE_METRICS_TOKEN` unset the endpoint must refuse, not open.
 *     An open metrics endpoint reached by forgetting an environment variable is the failure this
 *     branch exists to prevent, so it is pinned rather than left to the integration suite.
 *   - **the scheme is required.** A bare token in the header must not authenticate. Accepting one
 *     would mean the credential is read from a header shape no client should send, which is one
 *     more place for it to leak from.
 *   - **length mismatches must not throw.** `timingSafeEqual` raises on unequal lengths, so the
 *     lengths are folded into the boolean first. Remove that guard and every wrong-length token
 *     becomes a 500 — and a length oracle.
 *
 * The limiters themselves are configuration, and what is worth pinning about them is the
 * relationship between the two numbers rather than either value: the credential budget must stay
 * a small fraction of the browsing budget, because the reason it exists is that they must not
 * share a bucket.
 */
import { asStub } from '@tests/stub';
import type { Request } from 'express';
import {
    DEFAULT_RATE_LIMIT_MAX,
    DEFAULT_RATE_LIMIT_WINDOW_MS,
    DEFAULT_AUTH_RATE_LIMIT_MAX,
    isMetricsScraper
} from '@infrastructure/http/middlewares/security';
import { makeResponseStub } from '@tests/express';

/** Captures the status/body pair `rejectResponse` writes, without an HTTP server. */

const makeRequest = (authorization?: string) =>
    asStub<Request>({
        header: (name: string) =>
            name.toLowerCase() === 'authorization' ? authorization : undefined
    });

const originalToken = process.env.NODE_METRICS_TOKEN;

afterEach(() => {
    if (originalToken === undefined) delete process.env.NODE_METRICS_TOKEN;
    else process.env.NODE_METRICS_TOKEN = originalToken;
});

describe('rate limit defaults', () => {
    it('measures the browsing budget per minute', () => {
        // The window is the load-bearing half of the pair: the same 100 requests spread over a
        // quarter of an hour is a session quota an ordinary browsing session trips.
        expect(DEFAULT_RATE_LIMIT_WINDOW_MS).toBe(60 * 1000);
        expect(DEFAULT_RATE_LIMIT_MAX).toBe(100);
    });

    it('keeps the credential budget a small fraction of the browsing budget', () => {
        // The point of a second limiter is that browsing traffic and password guesses do not
        // spend the same allowance. Raise the credential budget to the global one and the
        // module still works — it just stops doing the thing it was added for.
        expect(DEFAULT_AUTH_RATE_LIMIT_MAX).toBeLessThan(DEFAULT_RATE_LIMIT_MAX / 5);
    });
});

describe('isMetricsScraper', () => {
    it('refuses every request when no token is configured', () => {
        delete process.env.NODE_METRICS_TOKEN;
        const response = makeResponseStub();
        const next = jest.fn();

        isMetricsScraper(makeRequest('Bearer anything'), response, next);

        expect(response.status).toHaveBeenCalledWith(503);
        expect(next).not.toHaveBeenCalled();
    });

    it('admits a request carrying the exact token', () => {
        process.env.NODE_METRICS_TOKEN = 'scrape-me';
        const response = makeResponseStub();
        const next = jest.fn();

        isMetricsScraper(makeRequest('Bearer scrape-me'), response, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(response.status).not.toHaveBeenCalled();
    });

    it('rejects the right token sent without the Bearer scheme', () => {
        process.env.NODE_METRICS_TOKEN = 'scrape-me';
        const response = makeResponseStub();
        const next = jest.fn();

        isMetricsScraper(makeRequest('scrape-me'), response, next);

        expect(response.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects a different scheme carrying the right value', () => {
        process.env.NODE_METRICS_TOKEN = 'scrape-me';
        const response = makeResponseStub();
        const next = jest.fn();

        isMetricsScraper(makeRequest('Basic scrape-me'), response, next);

        expect(response.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects a missing Authorization header', () => {
        process.env.NODE_METRICS_TOKEN = 'scrape-me';
        const response = makeResponseStub();
        const next = jest.fn();

        isMetricsScraper(makeRequest(), response, next);

        expect(response.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('answers 401 rather than throwing when the token length differs', () => {
        // `timingSafeEqual` throws on a length mismatch. Without the length comparison folded
        // into `matches`, this case leaves the middleware as an unhandled throw — and the throw
        // itself distinguishes a wrong-length token from a wrong-value one, which is the oracle.
        process.env.NODE_METRICS_TOKEN = 'scrape-me';
        const response = makeResponseStub();
        const next = jest.fn();

        expect(() => isMetricsScraper(makeRequest('Bearer short'), response, next)).not.toThrow();
        expect(response.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects an equal-length token that differs in one byte', () => {
        // Same length, so the comparison actually reaches `timingSafeEqual` rather than being
        // short-circuited by the length guard — this is the case that proves the guard is not
        // the only thing rejecting anything.
        process.env.NODE_METRICS_TOKEN = 'scrape-me';
        const response = makeResponseStub();
        const next = jest.fn();

        isMetricsScraper(makeRequest('Bearer scrape-mf'), response, next);

        expect(response.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects an empty configured token as unconfigured', () => {
        // `!expected` treats '' as unset, which is the safe reading: an empty string in the
        // environment is a variable someone meant to fill in.
        process.env.NODE_METRICS_TOKEN = '';
        const response = makeResponseStub();
        const next = jest.fn();

        isMetricsScraper(makeRequest('Bearer '), response, next);

        expect(response.status).toHaveBeenCalledWith(503);
        expect(next).not.toHaveBeenCalled();
    });
});
