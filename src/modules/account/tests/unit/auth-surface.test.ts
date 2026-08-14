/**
 * `index.ts` is this module's front door, and the authentication surface is the part of it that
 * most needs pinning.
 *
 * A barrel's only failure mode is a missing or misrouted name. A dropped line is a compile error
 * in a dozen files that TypeScript catches — but a line that re-exports the *wrong* binding, or a
 * name silently resolving to `undefined` after a refactor of the underlying file, is not caught by
 * anything. Both cases are covered here: the surface is pinned by name, and each function is
 * checked to be the same object `./jwt` and `./cookies` export rather than merely to exist.
 *
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import * as account from '@modules/account';
import * as jwt from '@modules/account/jwt';
import * as cookies from '@modules/account/cookies';

/** Re-exported from `./jwt` — creating and verifying the tokens themselves. */
const JWT_EXPORTS = [
    'verifyAccessToken',
    'verifyRefreshToken',
    'createRefreshToken',
    'createAccessToken'
] as const;

/** Re-exported from `./cookies` — the refresh and logged-in cookies that carry them. */
const COOKIE_EXPORTS = [
    'createRefreshCookie',
    'destroyRefreshCookie',
    'createLoggedCookie',
    'destroyLoggedCookie'
] as const;

/**
 * Re-exported from `./tokens` — the expiry and secret policy.
 *
 * These are on the barrel for one caller: `middlewares/authorizations.ts` verifies a token on
 * every request and needs the same rules that issued it.
 */
const POLICY_EXPORTS = [
    'RefreshTokenExpiryTime',
    'getExpiryTime',
    'getExpiryTimeMilliseconds',
    'getAccessTokenSecret',
    'getRefreshTokenSecret',
    'getAccessTokenTTL'
] as const;

/**
 * Re-exported from `./addresses-service` — the address book's ONE cross-module surface: the
 * cart's checkout resolves which address an order ships to. The CRUD stays internal, served by
 * this module's own routes.
 */
const ADDRESS_EXPORTS = ['addressForCheckout'] as const;

describe('the account barrel', () => {
    it.each(JWT_EXPORTS)('re-exports %s from ./jwt unchanged', (name) => {
        // Identity, not existence: a re-export resolving to a different object means the barrel
        // and the implementation have forked, which is the failure a smoke test misses.
        expect(account[name]).toBe(jwt[name]);
    });

    it.each(COOKIE_EXPORTS)('re-exports %s from ./cookies unchanged', (name) => {
        expect(account[name]).toBe(cookies[name]);
    });

    it('exports nothing beyond the declared groups', () => {
        // Widening a barrel is a design decision — it is a promise to every other module that the
        // shape will not move. This case makes that deliberate rather than incidental: a new
        // export fails here until it is written down above.
        expect(Object.keys(account).toSorted()).toEqual(
            [...JWT_EXPORTS, ...COOKIE_EXPORTS, ...POLICY_EXPORTS, ...ADDRESS_EXPORTS].toSorted()
        );
    });
});

/**
 * The barrel is the boundary, asserted rather than asked for.
 *
 * A docblock claiming nothing imports the implementations directly is PROSE, and prose drifts: a
 * consumer reaching one function through the barrel and another straight from `./tokens` reads
 * as perfectly normal in review, and nothing says otherwise.
 *
 * Inside the module, relative imports ARE the right thing: a unit test of `jwt.ts` tests `jwt.ts`,
 * and `cookies.ts` uses `./tokens` because one implementation may use another. What must not
 * happen is a file OUTSIDE `src/modules/account/` reaching past `index.ts`. ESLint enforces that
 * for files under `src/modules/**`, which is why the gap this test fills is everything else:
 * `src/middlewares/`, `src/bootstrap/`, `src/jobs/`, `src/workers/`, `src/infrastructure/`.
 */
describe('nothing outside the module reaches past the barrel', () => {
    const SOURCE_ROOT = path.join(__dirname, '..', '..', '..', '..');
    const ACCOUNT_ROOT = path.join(SOURCE_ROOT, 'modules', 'account');

    /** Every `.ts` file under `src/`, so a consumer anywhere is caught, not just a sibling. */
    const listSourceFiles = (directory: string): string[] =>
        readdirSync(directory).flatMap((entry) => {
            const entryPath = path.join(directory, entry);
            if (statSync(entryPath).isDirectory()) return listSourceFiles(entryPath);
            return entryPath.endsWith('.ts') ? [entryPath] : [];
        });

    it('finds the source tree it means to scan', () => {
        // A canary: a wrong root would make the assertion below pass over nothing.
        expect(existsSync(ACCOUNT_ROOT)).toBe(true);
        expect(listSourceFiles(SOURCE_ROOT).length).toBeGreaterThan(50);
    });

    it('no file outside src/modules/account imports its internals', () => {
        // The manifest is exempt, matching the cross-cutting boundary sweep: a sibling's test
        // that boots the registry legitimately names `@modules/account/module`.
        const offenders = listSourceFiles(SOURCE_ROOT)
            .filter((file) => !file.startsWith(ACCOUNT_ROOT))
            .filter((file) =>
                /from\s+'@modules\/account\/(?!module')[^']+'/.test(readFileSync(file, 'utf8'))
            )
            .map((file) => path.relative(SOURCE_ROOT, file));

        expect(offenders).toEqual([]);
    });
});
