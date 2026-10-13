/**
 * `scenarios/support/doubles/webhook-sink.ts` — the demo sink's SSRF exemption, registered from
 * `NODE_WEBHOOK_DEMO_SINK_URL`. The whole origin, or nothing: no sink, no exemption, no trust.
 */
import { readFileSync } from 'node:fs';
import { createServer, request } from 'node:https';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { registerWebhookSinkExemption } from '@scenarios/support/doubles/webhook-sink';
import {
    clearSsrfExemptOrigins,
    isSsrfExemptOrigin
} from '@infrastructure/adapters/ssrf-exemptions';
import { setEnvironment } from '@tests/environment';

/** The committed test CA, leaf and key the sink serves. */
const TLS_DIRECTORY = path.join(__dirname, '../../../scenarios/support/tls');

/** The roots this process trusted before any test ran. */
const ORIGINAL_ROOTS = tls.getCACertificates('default');

afterEach(() => {
    clearSsrfExemptOrigins();
    // Node >= 24.5: puts the process-wide roots back, so one test's trust never leaks into the next.
    tls.setDefaultCACertificates(ORIGINAL_ROOTS);
});

/**
 * Serves the committed leaf on a free loopback port, calls it once with default trust, and stops.
 *
 * @returns the sink's origin and whether the handshake succeeded
 */
const handshakeWithSink = (configure: (origin: string) => void): Promise<boolean> =>
    new Promise((resolve) => {
        const server = createServer(
            {
                cert: readFileSync(path.join(TLS_DIRECTORY, 'webhook-sink-cert.pem')),
                key: readFileSync(path.join(TLS_DIRECTORY, 'webhook-sink-key.pem'))
            },
            (_request, response) => {
                response.writeHead(200).end('{}');
            }
        );
        server.listen(0, '127.0.0.1', () => {
            const origin = `https://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
            configure(origin);
            const call = request(origin, (response) => {
                response.resume();
                server.close(() => {
                    resolve(true);
                });
            });
            call.on('error', () => {
                server.close(() => {
                    resolve(false);
                });
            });
            call.end();
        });
    });

describe('registerWebhookSinkExemption', () => {
    it('exempts the sink’s origin, port included', () => {
        setEnvironment({ NODE_WEBHOOK_DEMO_SINK_URL: 'https://127.0.0.1:3070/' });

        registerWebhookSinkExemption();

        expect(isSsrfExemptOrigin('https://127.0.0.1:3070')).toBe(true);
    });

    it('does not exempt the same host on another port', () => {
        setEnvironment({ NODE_WEBHOOK_DEMO_SINK_URL: 'https://127.0.0.1:3070' });

        registerWebhookSinkExemption();

        expect(isSsrfExemptOrigin('https://127.0.0.1:3071')).toBe(false);
        expect(isSsrfExemptOrigin('https://127.0.0.1')).toBe(false);
    });

    it('exempts nothing while no sink is configured', () => {
        setEnvironment({ NODE_WEBHOOK_DEMO_SINK_URL: undefined });

        registerWebhookSinkExemption();

        expect(isSsrfExemptOrigin('https://127.0.0.1:3070')).toBe(false);
    });

    it('exempts nothing for a value that is not a URL', () => {
        setEnvironment({ NODE_WEBHOOK_DEMO_SINK_URL: 'not a url' });

        expect(() => {
            registerWebhookSinkExemption();
        }).not.toThrow();
        expect(isSsrfExemptOrigin('not a url')).toBe(false);
    });

    it('trusts the sink’s test CA once a sink is configured', async () => {
        const reached = await handshakeWithSink((origin) => {
            setEnvironment({ NODE_WEBHOOK_DEMO_SINK_URL: origin });
            registerWebhookSinkExemption();
        });

        expect(reached).toBe(true);
    });

    it('keeps the public roots when it adds its own', () => {
        setEnvironment({ NODE_WEBHOOK_DEMO_SINK_URL: 'https://127.0.0.1:3070' });

        registerWebhookSinkExemption();

        expect(tls.getCACertificates('default').length).toBe(ORIGINAL_ROOTS.length + 1);
    });

    it('adds the CA only once however often it registers', () => {
        setEnvironment({ NODE_WEBHOOK_DEMO_SINK_URL: 'https://127.0.0.1:3070' });

        registerWebhookSinkExemption();
        registerWebhookSinkExemption();

        expect(tls.getCACertificates('default').length).toBe(ORIGINAL_ROOTS.length + 1);
    });

    it('trusts nothing extra while no sink is configured', async () => {
        const reached = await handshakeWithSink(() => {
            setEnvironment({ NODE_WEBHOOK_DEMO_SINK_URL: undefined });
            registerWebhookSinkExemption();
        });

        expect(reached).toBe(false);
    });
});
