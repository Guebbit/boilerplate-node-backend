/**
 * @module
 * A webhook subscriber a journey can point a subscription at: a local HTTPS listener that keeps
 * every delivery it gets and says whether each one was signed with the subscription's secret.
 *
 * It serves the demo sink's certificate and registers the sink exemption, the same two things the
 * dev preload does, so the real SSRF guard and the real TLS client run unchanged. The exemption
 * adds the sink's CA to the process-wide roots; {@link WebhookReceiver.stop} puts them back.
 */
import tls from 'node:tls';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { clearSsrfExemptOrigins } from '@infrastructure/adapters/ssrf-exemptions';
import { registerWebhookSinkExemption } from '@scenarios/support/doubles/webhook-sink';
import { verifyWebhookSignatureForTest } from '../../src/modules/webhooks/tests/verify-signature.fixture';
import { setEnvironment } from './environment';
import { startHttpsTestServer } from './https-test-server';
import { REPO_ROOT } from './paths';

/** The sink's leaf certificate and key: its SAN names 127.0.0.1, which the listener binds. */
const SINK_CREDENTIALS = {
    key: readFileSync(path.join(REPO_ROOT, 'scenarios/support/tls/webhook-sink-key.pem')),
    cert: readFileSync(path.join(REPO_ROOT, 'scenarios/support/tls/webhook-sink-cert.pem'))
};

/** One delivery as the subscriber received it. */
export interface ReceivedWebhook {
    /** The event's id (`webhook-id`): a redelivery of the same event carries the same one. */
    id: string;
    /** The event name, such as `order.paid`. */
    type: string;
    /** The parsed body. */
    body: Record<string, unknown>;
    /** Whether the signature verifies under the secret the subscriber was given. */
    signed: boolean;
}

/** A running subscriber. */
export interface WebhookReceiver {
    /** The `https://127.0.0.1:<port>` origin to subscribe. */
    url: string;
    /** What the endpoint answers: 200 by default, `500` to model a subscriber that is down. */
    answerWith: (status: number) => void;
    /** Every delivery so far, oldest first, checked against `secrets`. */
    received: (secrets: string[]) => ReceivedWebhook[];
    /** Closes the listener and puts the process's TLS roots back. */
    stop: () => Promise<void>;
}

/**
 * Starts the subscriber. Call it inside the case, before subscribing: it sets the sink
 * environment, which resets after each case.
 *
 * @returns the running subscriber
 */
export const startWebhookReceiver = async (): Promise<WebhookReceiver> => {
    const originalRoots = tls.getCACertificates('default');
    let status = 200;
    const server = await startHttpsTestServer((response: ServerResponse) => {
        response.statusCode = status;
        response.end();
    }, SINK_CREDENTIALS);
    setEnvironment({ NODE_WEBHOOK_DEMO_SINK_URL: server.url });
    registerWebhookSinkExemption();

    return {
        url: server.url,
        answerWith: (next) => {
            status = next;
        },
        received: (secrets) =>
            server.requests().map(({ headers, body }) => {
                const id = String(headers['webhook-id']);
                const parsed = JSON.parse(body) as Record<string, unknown>;

                return {
                    id,
                    type: String(parsed.type),
                    body: parsed,
                    signed: verifyWebhookSignatureForTest({
                        id,
                        timestamp: Number(headers['webhook-timestamp']),
                        body,
                        signatureHeader: String(headers['webhook-signature']),
                        secrets
                    })
                };
            }),
        stop: async () => {
            clearSsrfExemptOrigins();
            // Node >= 24.5: puts the process-wide roots back so the sink's CA never outlives the
            // case. https://nodejs.org/api/tls.html#tlssetdefaultcacertificatescerts
            tls.setDefaultCACertificates(originalRoots);
            await server.close();
        }
    };
};
