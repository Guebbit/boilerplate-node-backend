/**
 * `index.ts` is this module's front door, and it is one function wide.
 *
 * A barrel's only failure mode is a missing or misrouted name. A dropped line is a compile error in
 * a dozen files that TypeScript catches — but a line that re-exports the *wrong* binding, or a name
 * silently resolving to `undefined` after a refactor of the underlying file, is not caught by
 * anything. Both cases are covered here: the surface is pinned by name, and the function is checked
 * to be the same object `./services/addresses` exports rather than merely to exist.
 *
 * The token surface is deliberately not part of that front door: the kernel's auth port is what
 * every request goes through, and this module fills it from `module.ts` with relative imports, so
 * no sibling needs a token. `tests/cross-cutting/published-language.test.ts` is what stops such an
 * export being added on the theory that one might.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import * as account from '@modules/account';
import * as addresses from '@modules/account/services';

/**
 * Re-exported from `./services/addresses` — the address book's ONE cross-module surface: the
 * cart's checkout resolves which address an order ships to. The CRUD stays internal, served by
 * this module's own routes.
 */
const ADDRESS_EXPORTS = ['addressForCheckout'] as const;

describe('the account barrel', () => {
    it.each(ADDRESS_EXPORTS)('re-exports %s from ./services/addresses unchanged', (name) => {
        // Identity, not existence: a re-export resolving to a different object means the barrel
        // and the implementation have forked, which is the failure a smoke test misses.
        expect(account[name]).toBe(addresses[name]);
    });

    it('exports nothing beyond the declared groups', () => {
        // Widening a barrel is a design decision — it is a promise to every other module that the
        // shape will not move. This case makes that deliberate rather than incidental: a new
        // export fails here until it is written down above.
        expect(Object.keys(account).toSorted()).toEqual([...ADDRESS_EXPORTS].toSorted());
    });
});

/**
 * The barrel is the boundary, asserted rather than asked for.
 *
 * A docblock claiming nothing imports the implementations directly is PROSE, and prose drifts: a
 * consumer reaching one function through the barrel and another straight from `./session/jwt` reads
 * as perfectly normal in review, and nothing says otherwise.
 *
 * Inside the module, relative imports ARE the right thing: a unit test of `session/jwt.ts` tests
 * `session/jwt.ts`, and `session/cookies.ts` uses `./config` because one implementation may use
 * another. What must not
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
