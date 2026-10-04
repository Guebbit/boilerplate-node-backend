/**
 * The one proxy misconfiguration worth a warning, reported by express-rate-limit itself: an
 * `X-Forwarded-For` arriving while `NODE_TRUST_PROXY_HOPS` is `0`. A proxy is in front and nobody
 * counted it, so every caller shares one rate-limit bucket.
 *
 * The library checks ONCE per limiter, on the first request that reaches it, so this file's first
 * request is the forged one — and the probes (`/livez`, `/readyz`) are skipped by the global budget
 * before that check, so a container healthcheck never uses it up.
 *
 * See: docs/tools/security.md#trust-proxy-and-the-two-ways-to-get-it-wrong
 */
import { logger } from '@infrastructure/adapters/logger';
import { api } from '@tests/http';

describe('a forwarded address while trust proxy is off', () => {
    it('is reported through the app logger, once, naming the header', async () => {
        const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);

        await api().get('/livez').set('X-Forwarded-For', '203.0.113.5');
        await api().get('/').set('X-Forwarded-For', '203.0.113.5');
        await api().get('/').set('X-Forwarded-For', '198.51.100.9');

        const reported = error.mock.calls.filter(
            ([message]) =>
                typeof message === 'string' && message.startsWith('rate-limit: express-rate-limit')
        );
        error.mockRestore();

        expect(reported).toHaveLength(1);
        expect(String(reported[0]?.[1])).toContain('X-Forwarded-For');
    });
});
