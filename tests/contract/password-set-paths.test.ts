/**
 * @module
 * `password-set-paths`: every place a password gets written must run the SAME breach check —
 * tested once, across every entry point, instead of once per bug that found a gap in one of them.
 *
 * Only the owner sets a password: signup, the authenticated change and the reset or setup link.
 * The last describe below pins that list against the contract, so a staff route that sets one
 * cannot appear unnoticed. System-scoped because the paths span the contract, not one module.
 *
 * Two of the three are one function under the hood — `account/services/profile.ts#passwordChange`
 * is the shared funnel `passwordResetChange` (reset) and `passwordChangeWithCurrent` (change) both
 * end at, so "change" and "reset" are two ENTRY POINTS sharing one already-tested rule, not two
 * independent implementations. Signup runs its own check — see `authentication.ts#signup`.
 */

import '@tests/contract';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { Response } from 'supertest';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createUser, PLAIN_PASSWORD, userRepository } from '@modules/users/tests/factories';
import { TokenType } from '@modules/users';

setupTestDb();

// A listed, composition-valid entry in `breached-passwords/list.txt` — same fixture every
// existing breach case in this repo uses, so composition rules alone can't be what refuses it.
const BREACHED_PASSWORD = 'Password1!';

/** One place a password gets written, exercised over HTTP through its real route. */
interface PasswordSetPath {
    /** What every `describe.each` title names this path as. */
    name: string;

    /**
     * Attempts to set {@link BREACHED_PASSWORD} through this path, and returns a check that the
     * refusal left no trace — no new row for a create path, the old credential still live for an
     * existing one.
     */
    attempt: () => Promise<{ response: Response; assertNoChange: () => Promise<void> }>;
}

/** `POST /account/signup`. */
const signupPath: PasswordSetPath = {
    name: 'signup',
    attempt: async () => {
        const email = 'breach-signup@example.com';
        const response = await api().post('/account/signup').send({
            email,
            username: 'breachsignup',
            password: BREACHED_PASSWORD,
            passwordConfirm: BREACHED_PASSWORD,
            termsAccepted: true
        });
        return {
            response,
            assertNoChange: async () => {
                expect(await userRepository.findOne({ email })).toBeNull();
            }
        };
    }
};

/** `POST /account/password` — the authenticated, current-password change. */
const changePath: PasswordSetPath = {
    name: 'change',
    attempt: async () => {
        const { user, bearer } = await authenticateAs('user');
        const response = await api().post('/account/password').set('Authorization', bearer).send({
            currentPassword: PLAIN_PASSWORD,
            password: BREACHED_PASSWORD,
            passwordConfirm: BREACHED_PASSWORD
        });
        return {
            response,
            assertNoChange: async () => {
                const relogin = await api()
                    .post('/account/login')
                    .send({ email: user.email, password: PLAIN_PASSWORD });
                expect(relogin.status).toBe(200);
            }
        };
    }
};

/** `POST /account/reset-confirm` — the one-time-token change, no session required. */
const resetPath: PasswordSetPath = {
    name: 'reset',
    attempt: async () => {
        const user = await createUser({ email: 'breach-reset@example.com' });
        await user.tokenAdd(TokenType.PASSWORD_RESET, 60 * 60 * 1000, 'breach-reset-token');
        const response = await api().post('/account/reset-confirm').send({
            token: 'breach-reset-token',
            password: BREACHED_PASSWORD,
            passwordConfirm: BREACHED_PASSWORD
        });
        return {
            response,
            assertNoChange: async () => {
                const relogin = await api()
                    .post('/account/login')
                    .send({ email: user.email, password: PLAIN_PASSWORD });
                expect(relogin.status).toBe(200);
            }
        };
    }
};

describe.each([signupPath, changePath, resetPath])(
    '$name refuses a breached password',
    ({ attempt }) => {
        it('answers 422 and writes nothing', async () => {
            const { response, assertNoChange } = await attempt();

            expect(response.status).toBe(422);
            await assertNoChange();
        });
    }
);

/** The slice of the bundled contract the canary below reads. */
interface RawSpec {
    paths: Record<string, Record<string, { requestBody?: unknown } | undefined>>;
    components: { schemas: Record<string, { properties?: Record<string, { $ref?: string }> }> };
}

/** Where the bundled contract sits on disk — `npm run contracts:bundle` writes it. */
const SPEC_FILE = path.join(__dirname, '..', '..', 'openapi.yaml');

/** The schema name a request body points at, whatever its media type, or none. */
const bodySchemaNames = (requestBody: unknown): string[] => {
    const { content } = requestBody as { content?: Record<string, { schema?: { $ref?: string } }> };

    return Object.values(content ?? {})
        .map((media) => media.schema?.$ref?.split('/').pop())
        .filter((name): name is string => name !== undefined);
};

/**
 * Every operation whose request body carries a `PasswordNew`: a password being SET, as opposed
 * to one being proved (login, re-auth, delete-account).
 */
const operationsThatSetAPassword = (): string[] => {
    const spec = YAML.parse(readFileSync(SPEC_FILE, 'utf8')) as RawSpec;
    const setsPassword = (name: string): boolean =>
        Object.values(spec.components.schemas[name]?.properties ?? {}).some((property) =>
            property.$ref?.endsWith('/PasswordNew')
        );

    return Object.entries(spec.paths)
        .flatMap(([route, item]) =>
            Object.entries(item).map(([method, operation]) => ({ route, method, operation }))
        )
        .filter(
            ({ operation }) =>
                operation?.requestBody !== undefined &&
                bodySchemaNames(operation.requestBody).some((name) => setsPassword(name))
        )
        .map(({ route, method }) => `${method.toUpperCase()} ${route}`)
        .toSorted();
};

describe('the routes that can set a password', () => {
    // The owner's own three, and nobody else's: no staff route sets, resets or creates one. The
    // exact list is the canary, so a new route that sets a password fails here until it is a
    // deliberate addition (and gains a breach-check case above).
    it('are exactly signup, the owner’s own change and the reset or setup link', () => {
        expect(operationsThatSetAPassword()).toEqual([
            'POST /account/password',
            'POST /account/reset-confirm',
            'POST /account/signup'
        ]);
    });
});
