/**
 * @module
 * The observability route table and its two inline handlers. Neither `/events` nor `/metrics`
 * carries user data, but both map how the service behaves (reconnaissance worth having), so both
 * stay authenticated — DIFFERENTLY, since `/events` is opened by a browser's cookie-only
 * `EventSource` and `/metrics` is scraped by Prometheus with a static credential. The handlers are
 * inline in `routes.ts` (exercised only through the router's stack); `/metrics`'s error branch
 * matters most — it must answer a valid empty exposition, not an error body.
 */

import type { Request, Response } from 'express';
import { routeSignatures, guardsOn, routeTable } from '@tests/routes';
import { asStub } from '@tests/stub';

jest.mock('@infrastructure/observability/stream', () => ({
    __esModule: true,
    streamObservabilityMetrics: jest.fn()
}));

/*
 * Only `getPrometheusMetrics` is replaced. `metricsRegistry` is the REAL one: every module
 * registers its counters against it at import time, so a stub registry makes `new Counter({
 * registers: [metricsRegistry] })` throw before this suite reaches its first assertion. Keeping
 * it real also means the content type asserted below is the one the client library actually
 * negotiates, rather than a string this test invented and then agreed with itself about.
 */
jest.mock('@infrastructure/observability/metrics-http', () => ({
    ...jest.requireActual('@infrastructure/observability/metrics-http'),
    __esModule: true,
    getPrometheusMetrics: jest.fn()
}));

jest.mock('@infrastructure/adapters/logger', () => ({
    __esModule: true,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import { router } from '@modules/observability/routes';
import { streamObservabilityMetrics } from '@infrastructure/observability/stream';
import { getPrometheusMetrics, metricsRegistry } from '@infrastructure/observability/metrics-http';
import { logger } from '@infrastructure/adapters/logger';

/** The last handler mounted on a route — the inline one, past its guard. */
const handlerFor = (signature: string) => {
    const layers = asStub<{
        stack: {
            route?: {
                path: string;
                methods: Record<string, boolean>;
                stack: { handle: (request: Request, response: Response) => void }[];
            };
        }[];
    }>(router).stack;

    for (const { route } of layers) {
        if (route === undefined) continue;
        const method = Object.keys(route.methods)
            .find((each) => route.methods[each])!
            .toUpperCase();
        if (`${method} ${route.path}` === signature) return route.stack.at(-1)!.handle;
    }

    throw new Error(`No route ${signature}`);
};

/** A response double recording only what these two handlers actually touch. */
const fakeResponse = () => {
    const recorded = {
        headers: {} as Record<string, string>,
        status: undefined as number | undefined,
        body: undefined as unknown
    };
    const response = {
        setHeader: (name: string, value: string) => {
            recorded.headers[name] = value;
        },
        send: (body: unknown) => {
            recorded.body = body;
            return response;
        },
        status: (code: number) => {
            recorded.status = code;
            return response;
        }
    };

    return { response: asStub<Response>(response), recorded };
};

beforeEach(() => jest.clearAllMocks());

describe('observability routes — what is mounted', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'GET /events',
            'GET /metrics',
            'GET /health',
            'GET /metrics/overview',
            'GET /audit'
        ]);
    });

    it('declares /metrics before /metrics/overview without shadowing it', () => {
        // Two segments against one: they cannot collide, but the ordering is the file's stated
        // convention and the pair is the one place a future `/metrics/:name` would break.
        const paths = routeTable(router).map(({ path }) => path);

        expect(paths.indexOf('/metrics')).toBeLessThan(paths.indexOf('/metrics/overview'));
    });
});

describe('observability routes — the two guard styles', () => {
    it('guards the SSE stream by cookie, because EventSource cannot send a header', () => {
        const guards = guardsOn(router, 'GET /events');

        // The trailing `(anonymous)` is the inline handler itself — this route's work is written
        // in `routes.ts` rather than in `controllers/`, which is why it is exercised below
        // through the stack instead of by importing it.
        expect(guards).toEqual(['isAdminViaCookie', '(anonymous)']);
        // The ordinary chain here would lock out the only client this route exists for.
        expect(guards).not.toContain('isAuth');
    });

    it('guards the scrape by static credential, because Prometheus cannot log in', () => {
        expect(guardsOn(router, 'GET /metrics')).toEqual(['isMetricsScraper', '(anonymous)']);
    });

    it.each(['GET /health', 'GET /metrics/overview', 'GET /audit'])(
        '%s takes the ordinary admin chain',
        (signature) => {
            const guards = guardsOn(router, signature);

            expect(guards).toContain('getAuth');
            expect(guards).toContain('isAuth');
            expect(guards).toContain('isAdmin');
        }
    );

    it('leaves no observability endpoint unguarded', () => {
        // Every route here is a map of the service. The sweep covers all three guard styles at
        // once, so a route added with any of them passes and one added with none fails.
        const unguarded = routeSignatures(router).filter(
            (signature) =>
                !guardsOn(router, signature).some((guard) =>
                    ['isAdmin', 'isAdminViaCookie', 'isMetricsScraper'].includes(guard)
                )
        );

        expect(unguarded).toEqual([]);
    });
});

describe('GET /observability/events — the inline stream handler', () => {
    it('hands the raw response to the streamer, and writes nothing itself', () => {
        const { response, recorded } = fakeResponse();

        handlerFor('GET /events')({} as Request, response);

        // SSE owns the response for its lifetime: headers, keep-alives and the close. Anything
        // this handler sent first would end the stream before it began.
        expect(streamObservabilityMetrics).toHaveBeenCalledWith(response);
        expect(recorded.body).toBeUndefined();
        expect(recorded.status).toBeUndefined();
    });
});

describe('GET /observability/metrics — the inline scrape handler', () => {
    it('answers with the registry content type and the collected exposition', async () => {
        jest.mocked(getPrometheusMetrics).mockResolvedValueOnce('# HELP up\nup 1\n');
        const { response, recorded } = fakeResponse();

        handlerFor('GET /metrics')({} as Request, response);
        await Promise.resolve();
        await Promise.resolve();

        // The content type comes off the registry rather than being written out here: Prometheus
        // negotiates it, and a hardcoded one drifts the moment the client library changes format.
        expect(recorded.headers['Content-Type']).toBe(metricsRegistry.contentType);
        expect(recorded.body).toBe('# HELP up\nup 1\n');
        expect(recorded.status).toBeUndefined();
    });

    it('answers a failed collection with 500 and a valid empty exposition', async () => {
        jest.mocked(getPrometheusMetrics).mockRejectedValueOnce(new Error('registry exploded'));
        const { response, recorded } = fakeResponse();

        handlerFor('GET /metrics')({} as Request, response);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(recorded.status).toBe(500);
        // A comment line, not an error page: the body still has to parse as an exposition, or the
        // scraper logs a format error on top of the outage and the series simply stops.
        expect(recorded.body).toBe('# metrics unavailable\n');
    });

    it('logs the collection failure with its message, so the gap has a cause', async () => {
        jest.mocked(getPrometheusMetrics).mockRejectedValueOnce(new Error('registry exploded'));
        const { response } = fakeResponse();

        handlerFor('GET /metrics')({} as Request, response);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(logger.error).toHaveBeenCalledWith('Failed to collect Prometheus metrics', {
            error: 'registry exploded'
        });
    });
});
