/**
 * A bearer that names no live session is refused with 401 `invalid_token` wherever the contract
 * lets a sign-in be presented (`getAuth`), but never on an operation whose contract says
 * `security: []`: sign-in, sign-up, refresh, logout, password reset and the like are exactly where
 * a client holding a stale token must still be answered.
 *
 * The set of exempt operations is read from the bundled spec, not listed here, so a new open
 * operation is covered the moment its contract declares it. Every one is sent a stale bearer
 * over the real mounted chain; none may answer the `invalid_token` challenge.
 *
 * @see docs/understand/security.md#a-bad-bearer-on-a-public-page
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { REPO_ROOT } from '@tests/paths';

setupTestDb();

/** The slice of the bundled spec this file reads. */
interface SpecDocument {
    /** Path to verb to the operation's security requirements. */
    paths: Record<string, Record<string, { security?: unknown[] }>>;
}

/** The HTTP methods an operation sits under that this file can send. */
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** A bearer no resolver accepts: not a JWT, not an `sk_` key. */
const STALE_BEARER = 'Bearer stale.bearer.token';

/** The challenge `getAuth` answers a bad bearer with. */
const INVALID_TOKEN = 'Bearer error="invalid_token"';

/** The contract, parsed from the root openapi.yaml. */
const spec = parse(readFileSync(path.join(REPO_ROOT, 'openapi.yaml'), 'utf8')) as SpecDocument;

/** Every `security: []` operation, with its `{param}` segments filled in so a request can name it. */
const openOperations = Object.entries(spec.paths).flatMap(([route, item]) =>
    METHODS.filter((method) => {
        const security = item[method]?.security;
        return Array.isArray(security) && security.length === 0;
    }).map((method) => ({
        method,
        route,
        url: route.replaceAll(/\{[^}]+\}/g, '000000000000000000000000')
    }))
);

describe('a stale bearer on an operation whose contract takes no sign-in', () => {
    it('finds the open operations to send it to', () => {
        // A spec that parsed to nothing would make every case below pass without sending anything.
        expect(openOperations.length).toBeGreaterThan(0);
        expect(openOperations.map(({ route }) => route)).toContain('/account/login');
    });

    it.each(
        openOperations.map((operation) => [`${operation.method} ${operation.route}`, operation])
    )('does not challenge %s with invalid_token', async (_label, { method, url }) => {
        const response = await api()
            [method](url)
            .set('Authorization', STALE_BEARER)
            .send(method === 'get' ? undefined : {});

        expect(response.headers['www-authenticate']).not.toBe(INVALID_TOKEN);
    });

    it('is the same bearer that a sign-in-accepting operation refuses', async () => {
        // The canary: without it, a bearer that was simply never bad would pass every case above.
        const response = await api().get('/products').set('Authorization', STALE_BEARER);

        expect(response.status).toBe(401);
        expect(response.headers['www-authenticate']).toBe(INVALID_TOKEN);
    });
});
