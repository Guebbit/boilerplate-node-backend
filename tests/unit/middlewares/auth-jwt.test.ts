/**
 * `src/middlewares/auth-jwt.ts` is a barrel: it re-exports `./token` and `./cookie` and holds no
 * logic of its own. That is exactly why it needs a test — a barrel's only failure mode is a
 * missing or misrouted name, and nothing else in the suite would notice.
 *
 * Every controller imports from this path rather than from the two implementation modules, so a
 * dropped line here is a compile error in a dozen files that TypeScript catches — but a line that
 * re-exports the *wrong* binding, or a name silently resolving to `undefined` at runtime after a
 * refactor of the underlying module, is not caught by anything. Both cases are covered below:
 * the surface is pinned by name, and each function is checked to be the same object the
 * implementation module exports rather than merely to exist.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import * as authJwt from '@middlewares/auth-jwt';
import * as token from '@middlewares/token';
import * as cookie from '@middlewares/cookie';

/**
 * The front door's declared surface. A name added to `auth-jwt.ts` without being added here
 * fails the exhaustiveness case below, so the list cannot silently drift out of date.
 */
const TOKEN_EXPORTS = [
    'ERefreshTokenExpiryTime',
    'getExpiryTime',
    'getExpiryTimeMilliseconds',
    'verifyAccessToken',
    'verifyRefreshToken',
    'createRefreshToken',
    'createAccessToken'
] as const;

const COOKIE_EXPORTS = [
    'createRefreshCookie',
    'destroyRefreshCookie',
    'createLoggedCookie',
    'destroyLoggedCookie'
] as const;

describe('auth-jwt barrel', () => {
    it.each(TOKEN_EXPORTS)('re-exports %s from ./token unchanged', (name) => {
        // Identity, not existence: a re-export that resolves to a different object means the
        // barrel and the implementation have forked, which is the failure a smoke test misses.
        expect(authJwt[name]).toBe(token[name]);
    });

    it.each(COOKIE_EXPORTS)('re-exports %s from ./cookie unchanged', (name) => {
        expect(authJwt[name]).toBe(cookie[name]);
    });

    it('exports nothing beyond the two declared groups', () => {
        // The barrel is the module's front door, so widening it is a design decision — adding a
        // third concern should mean adding a file. This case makes that deliberate rather than
        // incidental: a new export fails here until it is written down above.
        expect(Object.keys(authJwt).toSorted()).toEqual(
            [...TOKEN_EXPORTS, ...COOKIE_EXPORTS].toSorted()
        );
    });
});

/**
 * The docblock on `auth-jwt.ts` states that it is "the import path everything actually uses, and
 * nothing imports those two directly". That was PROSE, and prose drifts: `authorizations.ts` was
 * importing `verifyAccessToken` through the barrel and `verifyRefreshToken` straight from
 * `./token`, so the claim was already false and nothing said so.
 *
 * This makes it a rule. A front door that half the callers walk around is not a front door, and
 * the cost is not cosmetic — the barrel is where a future third concern is meant to be added, and
 * it can only serve that purpose if it is genuinely the only path in.
 */
describe('the barrel is the only way in', () => {
    const middlewaresDirectory = path.join(__dirname, '..', '..', '..', 'src', 'middlewares');

    /** Every `.ts` file under `src/`, so a consumer anywhere is caught, not just a sibling. */
    const listSourceFiles = (directory: string): string[] =>
        readdirSync(directory).flatMap((entry) => {
            const entryPath = path.join(directory, entry);
            if (statSync(entryPath).isDirectory()) return listSourceFiles(entryPath);
            return entryPath.endsWith('.ts') ? [entryPath] : [];
        });

    /**
     * `cookie.ts` importing `./token` is the one sanctioned exception, and it is not a consumer
     * walking around the front door — it is one implementation using another. Routing it through
     * the barrel would make the import circular (barrel imports cookie, cookie imports barrel).
     */
    const SANCTIONED = new Set([path.join(middlewaresDirectory, 'cookie.ts')]);

    it('no source file imports ./token or ./cookie except through auth-jwt', () => {
        const sourceRoot = path.join(__dirname, '..', '..', '..', 'src');
        const offenders = listSourceFiles(sourceRoot)
            .filter((file) => !file.endsWith(path.join('middlewares', 'auth-jwt.ts')))
            .filter((file) => !SANCTIONED.has(file))
            .filter((file) => {
                const source = readFileSync(file, 'utf8');
                return /from\s+'(\.\/|@middlewares\/)(token|cookie)'/.test(source);
            })
            .map((file) => path.relative(sourceRoot, file));

        expect(offenders).toEqual([]);
    });
});
