/**
 * What `installSecurity` hands Express for `NODE_TRUST_PROXY_HOPS`: a COUNT, and `false` — not `0` —
 * for "no proxy". express-rate-limit tells "trust proxy is off" by `=== false`, and only then does
 * it notice an `X-Forwarded-For` from a proxy nobody counted; the warning itself is covered by
 * `tests/integration/trust-proxy-warning.test.ts`.
 */
import express from 'express';
import { installSecurity } from '@app/security';
import { setEnvironment } from '@tests/environment';

/**
 * The `trust proxy` setting `installSecurity` leaves on an app, for a hop count.
 *
 * @param hops - the value of `NODE_TRUST_PROXY_HOPS`
 */
const trustProxyFor = (hops: string): unknown => {
    setEnvironment({ NODE_TRUST_PROXY_HOPS: hops });
    const app = express();
    installSecurity(app);
    return app.get('trust proxy');
};

describe('installSecurity trust proxy', () => {
    it('is false, not 0, when no proxy is in front', () => {
        expect(trustProxyFor('0')).toBe(false);
    });

    it.each([1, 2, 3])('is the hop count when it is %s', (hops) => {
        expect(trustProxyFor(String(hops))).toBe(hops);
    });
});
