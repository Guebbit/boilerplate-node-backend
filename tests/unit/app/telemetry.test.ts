/**
 * `installTelemetry` — the in-flight gauge must come back down for every request, including the
 * ones that never finish: a client abort, or a streamed response the client walks away from.
 */
import { EventEmitter } from 'node:events';
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { asStub } from '@tests/stub';
import { installTelemetry } from '@app/telemetry';
import { httpInflightRequests } from '@infrastructure/observability/metrics-http';

/** The middleware `installTelemetry` mounts, captured off a stub app. */
const telemetryMiddleware = (): RequestHandler => {
    const use = jest.fn();
    installTelemetry(asStub<Express>({ use }));
    return (use.mock.calls[0] as [RequestHandler])[0];
};

/** The gauge's current value. */
const inflight = async (): Promise<number> => {
    const { values } = await httpInflightRequests.get();
    return values[0]?.value ?? 0;
};

describe('installTelemetry', () => {
    it('counts a request that closes without finishing back out of the in-flight gauge', async () => {
        const before = await inflight();
        // eslint-disable-next-line unicorn/prefer-event-target -- stands in for Express's Response, an EventEmitter whose `once` the middleware calls; EventTarget has no `once`
        const response = Object.assign(new EventEmitter(), { statusCode: 200 });
        const next: NextFunction = jest.fn();

        telemetryMiddleware()(asStub<Request>({ method: 'GET' }), asStub<Response>(response), next);
        expect(await inflight()).toBe(before + 1);

        // The client went away mid-stream: `close` fires, `finish` never does.
        response.emit('close');

        expect(await inflight()).toBe(before);
    });
});
