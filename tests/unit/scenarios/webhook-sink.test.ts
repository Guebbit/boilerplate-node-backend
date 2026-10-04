/**
 * `scenarios/support/doubles/webhook-sink.ts` — the demo sink's SSRF exemption, registered from
 * `NODE_WEBHOOK_DEMO_SINK_URL`. The whole origin, or nothing: no sink, no exemption.
 */
import { registerWebhookSinkExemption } from '@scenarios/support/doubles/webhook-sink';
import {
    clearSsrfExemptOrigins,
    isSsrfExemptOrigin
} from '@infrastructure/adapters/ssrf-exemptions';
import { setEnvironment } from '@tests/environment';

afterEach(() => {
    clearSsrfExemptOrigins();
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
});
