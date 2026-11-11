/**
 * @module
 * A server span's `client.address` is the address Express resolves through `trust proxy`, not the
 * leftmost `X-Forwarded-For` entry a caller can write.
 *
 * The real `installSecurity` is mounted, so this also proves the stamping middleware sits after
 * `trust proxy`. The span is a stub: the instrumentation itself is not started in a test worker.
 */

import express from 'express';
import request from 'supertest';
import type { Span } from '@opentelemetry/api';
import { installSecurity } from '@app/security';
import { onIncomingRequest } from '@infrastructure/runtime/otel-sdk';
import { correlationDigest } from '@infrastructure/security/pseudonymise';
import { withEnvironmentOverrides } from '@tests/environment';
import { asStub } from '@tests/stub';

/** The app with one trusted proxy hop, and the stub span the instrumentation would have started. */
const appWithSpan = () => {
    const setAttribute = jest.fn();
    const span = asStub<Span>({
        attributes: { 'client.address': '198.51.100.99' },
        setAttribute,
        setAttributes: jest.fn(),
        addLink: jest.fn()
    });
    const app = express();
    // What `HttpInstrumentation`'s `requestHook` does before Express sees the request.
    app.use((incoming, _response, next) => {
        onIncomingRequest(span, incoming);
        next();
    });
    installSecurity(app);
    app.get('/', (_incoming, response) => {
        response.end();
    });
    return { app, setAttribute };
};

describe('a server span client.address', () => {
    it('digests request.ip, not the leftmost X-Forwarded-For a caller can write', async () => {
        await withEnvironmentOverrides(
            { NODE_TRUST_PROXY_HOPS: '1', NODE_LOG_PERSONAL_FIELDS: 'hash' },
            () => {
                const { app, setAttribute } = appWithSpan();
                return request(app)
                    .get('/')
                    .set('X-Forwarded-For', '198.51.100.99, 203.0.113.7')
                    .then(() => {
                        expect(setAttribute).toHaveBeenLastCalledWith(
                            'client.address',
                            correlationDigest('203.0.113.7')
                        );
                    });
            }
        );
    });

    it('is left alone in plain mode', async () => {
        await withEnvironmentOverrides(
            { NODE_TRUST_PROXY_HOPS: '1', NODE_LOG_PERSONAL_FIELDS: 'plain' },
            () => {
                const { app, setAttribute } = appWithSpan();
                return request(app)
                    .get('/')
                    .then(() => {
                        expect(setAttribute).not.toHaveBeenCalled();
                    });
            }
        );
    });
});
