/**
 * @module
 * `GET /observability/metrics` — the Prometheus scrape endpoint. Exercises both the happy path and
 * a failed collection, since the failure branch must still answer a valid empty exposition rather
 * than an error body — a scraper logs a format error on top of the outage otherwise.
 */

import type { Response } from 'express';
import { asStub } from '@tests/stub';
import { getObservabilityMetrics } from '@modules/observability/controllers/get-observability-metrics';
import {
    getPrometheusMetrics,
    metricsRegistry
} from '@infrastructure/observability/metrics-registry';
import { logger } from '@infrastructure/adapters/logger';

/*
 * Only `getPrometheusMetrics` is replaced. `metricsRegistry` is the REAL one: every module
 * registers its counters against it at import time, so a stub registry makes `new Counter({
 * registers: [metricsRegistry] })` throw before this suite reaches its first assertion. Keeping
 * it real also means the content type asserted below is the one the client library actually
 * negotiates, rather than a string this test invented and then agreed with itself about.
 */
jest.mock('@infrastructure/observability/metrics-registry', () => ({
    ...jest.requireActual('@infrastructure/observability/metrics-registry'),
    __esModule: true,
    getPrometheusMetrics: jest.fn()
}));

jest.mock('@infrastructure/adapters/logger', () => ({
    __esModule: true,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

/** A response double recording only what this handler touches. */
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

describe('GET /observability/metrics', () => {
    it('answers with the registry content type and the collected exposition', async () => {
        jest.mocked(getPrometheusMetrics).mockResolvedValueOnce('# HELP up\nup 1\n');
        const { response, recorded } = fakeResponse();

        getObservabilityMetrics({} as never, response);
        await Promise.resolve();
        await Promise.resolve();

        // The content type comes off the registry rather than being written out here: Prometheus
        // negotiates it, and a hardcoded one drifts the moment the client library changes format.
        expect(recorded.headers['Content-Type']).toBe(metricsRegistry.contentType);
        expect(recorded.body).toBe('# HELP up\nup 1\n');
        expect(recorded.status).toBeUndefined();
    });

    it('answers a failed collection with a typed 500 and a one-line comment body', async () => {
        jest.mocked(getPrometheusMetrics).mockRejectedValueOnce(new Error('registry exploded'));
        const { response, recorded } = fakeResponse();

        getObservabilityMetrics({} as never, response);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(recorded.status).toBe(500);
        // Typed like the success: the contract says text, and Prometheus only reads the status.
        expect(recorded.headers['Content-Type']).toBe(metricsRegistry.contentType);
        // A comment line, not an error page: the body is still plain exposition text.
        expect(recorded.body).toBe('# metrics unavailable\n');
    });

    it('logs the collection failure with its cause, so the gap is explicable', async () => {
        const failure = new Error('registry exploded');
        jest.mocked(getPrometheusMetrics).mockRejectedValueOnce(failure);
        const { response } = fakeResponse();

        getObservabilityMetrics({} as never, response);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        // The Error itself, not its message: `redactFormat` hands anything under `error` to
        // `serializeError`, which is what keeps the name — and, outside production, the stack.
        // Flattening it to a string here would be asserting that we throw both away.
        expect(logger.error).toHaveBeenCalledWith('Failed to collect Prometheus metrics', {
            error: failure
        });
    });
});
