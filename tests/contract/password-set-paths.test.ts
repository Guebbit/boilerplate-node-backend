/**
 * @module
 * `password-set-paths`: every place a password gets written must run the SAME breach check —
 * tested once, across every entry point, instead of once per bug that found a gap in one of them
 * (admin create once skipped it entirely). System-scoped rather than living in one module's own
 * suite: the five paths below span both `account` (signup, change, reset) and `users` (admin
 * create, admin update).
 *
 * Two of the five are one function under the hood — `account/services/profile.ts#passwordChange`
 * is the shared funnel `passwordResetChange` (reset) and `passwordChangeWithCurrent` (change) both
 * end at, so "change" and "reset" are two ENTRY POINTS sharing one already-tested rule, not two
 * independent implementations. Signup, admin create and admin update each run their own check —
 * see `authentication.ts#signup`, `users/services/create.ts#create` and `services/update.ts#update`.
 */

import '@tests/contract';
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

/** `POST /users` — an operator handing a brand-new account its first password. */
const adminCreatePath: PasswordSetPath = {
    name: 'admin create',
    attempt: async () => {
        const { bearer } = await authenticateAs('admin');
        const email = 'breach-admin-create@example.com';
        const response = await api().post('/users').set('Authorization', bearer).send({
            email,
            username: 'breachadmincreate',
            password: BREACHED_PASSWORD
        });
        return {
            response,
            assertNoChange: async () => {
                expect(await userRepository.findOne({ email })).toBeNull();
            }
        };
    }
};

/** `PUT /users/{id}` — an operator resetting someone else's password. */
const adminUpdatePath: PasswordSetPath = {
    name: 'admin update',
    attempt: async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({
            username: 'breachupdatetarget',
            email: 'breach-update-target@example.com'
        });
        const response = await api()
            .put(`/users/${target.id}`)
            .set('Authorization', bearer)
            .send({ email: target.email, username: target.username, password: BREACHED_PASSWORD });
        return {
            response,
            assertNoChange: async () => {
                const relogin = await api()
                    .post('/account/login')
                    .send({ email: target.email, password: PLAIN_PASSWORD });
                expect(relogin.status).toBe(200);
            }
        };
    }
};

describe.each([signupPath, changePath, resetPath, adminCreatePath, adminUpdatePath])(
    '$name refuses a breached password',
    ({ attempt }) => {
        it('answers 422 and writes nothing', async () => {
            const { response, assertNoChange } = await attempt();

            expect(response.status).toBe(422);
            await assertNoChange();
        });
    }
);
