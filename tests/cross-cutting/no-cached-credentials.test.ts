import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Guard: no route on the account router caches its response.
 *
 * `account/routes.ts` mounts `noStore` router-wide, and its comment says why — *"a route added
 * later cannot silently omit it"*. That was not true: `setCache` calls
 * `response.set('Cache-Control', …)`, which REPLACES the header `noStore` set, so `GET /account`
 * answered `private, max-age=3600` and a browser stored the caller's own profile for an hour.
 *
 * The interaction is invisible at both ends. The router-level mount looks total; the route-level
 * `setCache` looks like an ordinary optimisation. Nothing fails, and the header is only wrong on
 * the wire — so this reads the file rather than trusting either comment.
 *
 * Scoped to `account` on purpose. Caching is correct and wanted elsewhere; what makes this router
 * different is that every route on it either exchanges credentials or serves identity.
 */

const ACCOUNT_ROUTES = path.join(__dirname, '..', '..', 'src', 'modules', 'account', 'routes.ts');

const source = () => readFileSync(ACCOUNT_ROUTES, 'utf8');

describe('the account router never caches', () => {
    it('mounts noStore for every route', () => {
        expect(source()).toMatch(/router\.use\(noStore\)/);
    });

    it('calls setCache on no route', () => {
        // `setCache` would overwrite `Cache-Control` on whichever route mounted it, which is the
        // one way the blanket mount above can be defeated without looking wrong.
        const offending = source()
            .split('\n')
            .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
            .filter((line) => line.includes('setCache('));

        expect(offending).toEqual([]);
    });
});
