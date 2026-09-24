/**
 * Can an `sk_...` credential actually REACH a route, and only the right ones.
 *
 * `getAuth` resolving a credential and `requirePermission` checking its key are each proven on
 * their own — the api-key suite drives `resolveCredential` directly, the contract suite drives
 * the admin routes with a SESSION token — but neither proves the identity GUARD between them
 * actually admits a credential onto a route built to accept one. This file is that middle link,
 * over the real mounted chain.
 *
 * Two halves, and the second is the one that keeps the first true:
 *
 * 1. A real credential, over the real Express chain, against real routes — allowed where its key
 *    matches, 403 where it does not, 401 on a route whose subject is the caller themselves.
 * 2. That no module mounts BOTH identity guards, so which routes admit a credential stays a
 *    property of the module rather than of the line a route happens to sit on.
 *
 * The other half of the mount rule — that no controller behind `isAuthOrCredential` reads
 * `request.authContext` — belongs to `tests/cross-cutting/authenticated-controllers.test.ts`,
 * which asks it per ROUTE off Express's own resolved stack rather than per file off the source
 * text, and so needs no list of exceptions to stay true.
 *
 * See: docs/tools/security.md#machine-to-machine-credentials
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { MODULES_ROOT } from '@tests/paths';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import type { TenantCallerContext } from '@types';
import { createUser } from '@modules/users/tests/factories';
// `module.ts`'s side effect (`registerCredentialResolver`) is what makes a credential resolve at
// all — importing the module is what a real boot does.
import '@modules/api-keys/module';
import { mint } from '@modules/api-keys/services/api-keys';

setupTestDb();

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

        // The credential must clear the identity guard, not just the permission check below it.
        expect(response.status).toBe(200);
    });

    /**
     * 403, not 401, and the difference is the whole point of splitting the two guards: the
     * credential authenticated fine, it just does not hold this key. A 401 here would mean the
     * identity guard rejected a valid credential, the same failure at a different status.
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
 * A file's CODE, with comment lines dropped.
 *
 * The rule below matches guard names, and every deliberate exclusion carries a comment NAMING the
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

/**
 * The rule that keeps the split honest as routes are added. Source-level, because it is a
 * property of how a module is WRITTEN — a request-level test can only reach the routes someone
 * remembered to add to it.
 */
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
});
