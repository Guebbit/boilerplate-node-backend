/**
 * Can an `sk_...` credential actually REACH a route, and only the right ones.
 *
 * The bug this exists for: `isAuth` checked `request.authContext` and never `request.caller`, so
 * every credential-authenticated request died at the guard with a 401. `getAuth` resolved the
 * credential correctly and `requirePermission` handled it correctly — the middleware between them
 * did not, and nothing noticed because the api-key suite calls `resolveCredential` directly and
 * its contract test drives the admin routes with a SESSION token. The resolver was proven; the
 * path to it never was.
 *
 * Two halves, and the second is the one that keeps the first true:
 *
 * 1. A real credential, over the real Express chain, against real routes — allowed where its key
 *    matches, 403 where it does not, 401 on a route whose subject is the caller themselves.
 * 2. The mount-shape rules that make the split checkable rather than a matter of taste, so a
 *    route added later cannot quietly land on the wrong side.
 *
 * See: docs/tools/security.md#machine-to-machine-credentials
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import type { TenantCallerContext } from '@types';
import { createUser } from '@modules/users/tests/factories';
// `module.ts`'s side effect (`registerCredentialResolver`) is what makes a credential resolve at
// all — importing the module is what a real boot does.
import '@modules/api-keys/module';
import { mint } from '@modules/api-keys/services/api-keys';

setupTestDb();

const MODULES_ROOT = path.join(__dirname, '..', '..', 'src', 'modules');

/**
 * Mint a real credential holding exactly `permissions`, and return its plaintext secret.
 *
 * Through the real `mint`, not a fixture: the secret has to be one `resolveCredential` will
 * actually recognise, and the minter has to really hold the keys — `mint` refuses a superset.
 */
const credentialHolding = async (permissions: string[]): Promise<string> => {
    const user = await createUser({ verifiedAt: new Date() }, 'admin');
    const context: TenantCallerContext = {
        caller: {
            id: String(user._id),
            // `DEPLOYMENT_TENANT_ID`, not `TEST_TENANT_ID`: `createUser` writes the minter's
            // membership under the former, and `resolveCredential` re-reads what the minter holds
            // NOW rather than trusting the snapshot. A mismatch here mints fine and then resolves
            // to no permissions at all, which reads as a 403 and looks like a guard bug.
            tenantId: DEPLOYMENT_TENANT_ID,
            scope: 'tenant',
            permissions,
            unrestricted: false
        },
        analyticsConsent: false
    };

    const result = await mint({ name: 'partner integration', permissions }, context);
    if (!result.success || !result.data) throw new Error('mint failed in test setup');

    return result.data.secret;
};

describe('an api key over the real chain', () => {
    it('reaches a tenant route its permission covers', async () => {
        const secret = await credentialHolding(['users.any.read']);

        const response = await api().get('/users').set('Authorization', `Bearer ${secret}`);

        // The assertion that was impossible before the fix: anything but 401 at the guard.
        expect(response.status).toBe(200);
    });

    /**
     * 403, not 401, and the difference is the whole point of splitting the two guards: the
     * credential authenticated fine, it just does not hold this key. A 401 here would be the old
     * bug wearing a different status.
     */
    it('is refused with 403 on a tenant route its permission does not cover', async () => {
        const secret = await credentialHolding(['users.any.read']);

        const response = await api()
            .get('/inventory/levels')
            .set('Authorization', `Bearer ${secret}`);

        expect(response.status).toBe(403);
    });

    /**
     * A route whose subject is the CALLER, not the tenant. These read `request.authContext!.id`,
     * an assertion sound only because `isAuth` admits nothing without a session — so the right
     * answer is 401, and the thing that must never happen is a 500 from a credential getting
     * through to a controller that assumes a user.
     */
    it.each([
        ['GET', '/cart'],
        ['GET', '/account/sessions'],
        ['GET', '/account']
    ])('answers 401, never 500, on %s %s', async (method, route) => {
        const secret = await credentialHolding(['users.any.read']);

        const response = await api()
            [method.toLowerCase() as 'get'](route)
            .set('Authorization', `Bearer ${secret}`);

        expect(response.status).toBe(401);
    });

    /** A secret that never existed authenticates as nobody, and gets the guard's 401. */
    it('refuses an unknown credential', async () => {
        const response = await api()
            .get('/users')
            .set('Authorization', 'Bearer sk_not_a_real_credential_at_all');

        expect(response.status).toBe(401);
    });

    /**
     * Minting credentials stays a human act. `api-keys` reads no `authContext` and so passes the
     * mechanical test for opening up — it is closed by decision, because a credential that can
     * mint credentials never has to be rotated.
     */
    it('cannot mint another credential with a credential', async () => {
        const secret = await credentialHolding(['apikeys.any.create']);

        const response = await api()
            .post('/api-keys')
            .set('Authorization', `Bearer ${secret}`)
            .send({ name: 'second key', permissions: ['apikeys.any.create'] });

        expect(response.status).toBe(401);
    });
});

/**
 * The rules that keep the split honest as routes are added. Source-level, because they are
 * properties of how a module is WRITTEN — a request-level test can only reach the routes someone
 * remembered to add to it.
 */
/**
 * A file's CODE, with comment lines dropped.
 *
 * Both rules below match guard names, and every deliberate exclusion carries a comment NAMING the
 * guard it chose not to mount — `orders` and `api-keys` each say why in prose. A raw-text match
 * reads those as mounts and reports the two best-documented decisions in the codebase as
 * violations.
 */
const codeOf = (file: string): string =>
    readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => {
            const trimmed = line.trimStart();
            return (
                !trimmed.startsWith('*') && !trimmed.startsWith('//') && !trimmed.startsWith('/*')
            );
        })
        .join('\n');

describe('the guard split', () => {
    const routeFiles = readdirSync(MODULES_ROOT)
        .map((name) => ({ name, file: path.join(MODULES_ROOT, name, 'routes.ts') }))
        .filter(({ file }) => existsSync(file));

    /**
     * Exactly one identity guard per module. Mounting both is not a compile error and not
     * obviously wrong on the page, but it means some routes admit credentials and some do not
     * with nothing saying which — the state this suite exists to prevent.
     */
    it.each(routeFiles)('$name mounts one kind of identity guard, not both', ({ file }) => {
        const mounts = codeOf(file);

        expect(/\bisAuth\b/.test(mounts) && /\bisAuthOrCredential\b/.test(mounts)).toBe(false);
    });

    /**
     * The rule that makes `isAuthOrCredential` safe: a controller behind it must never read
     * `request.authContext`, because a credential resolves to none. This is what stops the
     * one-line "just widen `isAuth`" fix from being reintroduced route by route — the ~100
     * `authContext!` reads elsewhere are sound only while nothing credential-shaped can reach
     * them.
     */
    it.each(routeFiles)(
        '$name reads no authContext behind a credential guard',
        ({ name, file }) => {
            if (!/\bisAuthOrCredential\b/.test(codeOf(file))) return;

            const controllers = path.join(MODULES_ROOT, name, 'controllers');
            const offenders = (existsSync(controllers) ? readdirSync(controllers) : [])
                .filter((entry) => entry.endsWith('.ts'))
                .filter((entry) =>
                    readFileSync(path.join(controllers, entry), 'utf8').includes('authContext')
                )
                // A module may mount the credential guard on SOME routes and leave its public reads
                // ungated; only a controller the guard actually fronts is in scope. Those are listed
                // per module below rather than parsed out of the router, because the parse would be
                // the same guess the rule exists to remove.
                .filter((entry) => !PUBLIC_READ_CONTROLLERS[name]?.includes(entry));

            expect(offenders).toEqual([]);
        }
    );
});

/**
 * Controllers that read `authContext` but sit on a route mounting NO identity guard — a public
 * read that personalises itself when a session happens to be present.
 *
 * Listed rather than inferred: each is a deliberate arrangement its own module documents, and a
 * rule that guessed at it would be asserting the guess.
 */
const PUBLIC_READ_CONTROLLERS: Record<string, string[]> = {
    products: ['get-product-item.ts', 'get-products.ts'],
    locales: ['get-locales.ts']
};
