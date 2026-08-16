/**
 * `src/modules/account/service.ts` — the signup, login, token and password-change FLOWS.
 *
 * The sibling `service.test.ts` covers the security invariants of the same file: that the two
 * login failures are indistinguishable, that a soft-deleted account cannot log in, that a password
 * is never stored as it arrived. This file covers the ordinary paths those invariants sit on —
 * a signup that succeeds, a login that returns a user, a token that is added, a password that
 * changes — and the argument-level rejections in front of them.
 *
 * Both drive a real database through `setupTestDb`, because every one of these decisions is made
 * against a stored user rather than a mocked one.
 *
 * It lives here rather than with `users` because the code under test is `account`'s. The two were
 * one file while both domains shared a `services/` directory; the split is what made the mismatch
 * visible.
 */
import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factory';
import * as accountService from '@modules/account/services';
import { userRepository } from '@modules/users';
import type { UserDocument } from '@modules/users';
import type { ResponseSuccess, ResponseReject } from '@infrastructure/http/response';

setupTestDb();

describe('accountService.signup', () => {
    it('creates a new user and returns a success response', async () => {
        const result = await accountService.signup(
            'new@example.com',
            'newuser',
            'Password1!',
            'Password1!'
        );

        expect(result.success).toBe(true);
        expect((result as ResponseSuccess<UserDocument>).data!.email).toBe('new@example.com');
    });

    it('rejects when passwords do not match', async () => {
        const result = await accountService.signup(
            'new@example.com',
            'newuser',
            'Password1!',
            'Different1!'
        );

        expect(result.success).toBe(false);
        expect((result as ResponseReject).errors).toHaveLength(1);
    });

    it('rejects with 409 when the email is already registered', async () => {
        await createUser({ email: 'taken@example.com' });

        const result = await accountService.signup(
            'taken@example.com',
            'anotheruser',
            'Password1!',
            'Password1!'
        );

        expect(result.success).toBe(false);
        expect((result as ResponseReject).status).toBe(409);
    });

    it('rejects with 422 when the email format is invalid', async () => {
        const result = await accountService.signup(
            'not-an-email',
            'user',
            'Password1!',
            'Password1!'
        );

        expect(result.success).toBe(false);
        // 422 across the board for validation failures, auth included — that is what
        // openapi.yaml declares, and it never declares 400 at all.
        expect((result as ResponseReject).status).toBe(422);
    });

    it('rejects with 422 when the password is too short', async () => {
        const result = await accountService.signup('short@example.com', 'shortpwd', 'abc', 'abc');

        expect(result.success).toBe(false);
        expect((result as ResponseReject).status).toBe(422);
    });
});

describe('accountService.login', () => {
    it('returns a success response with correct credentials', async () => {
        await createUser({ email: 'login@example.com' });

        const result = await accountService.login('login@example.com', PLAIN_PASSWORD);

        expect(result.success).toBe(true);
        expect((result as ResponseSuccess<UserDocument>).data!.email).toBe('login@example.com');
    });

    it('rejects with 401 for the wrong password', async () => {
        await createUser({ email: 'login@example.com' });

        const result = await accountService.login('login@example.com', 'WrongPassword!');

        expect(result.success).toBe(false);
        expect((result as ResponseReject).status).toBe(401);
    });

    it('rejects with 401 for a non-existent email', async () => {
        const result = await accountService.login('nobody@example.com', PLAIN_PASSWORD);

        expect(result.success).toBe(false);
        expect((result as ResponseReject).status).toBe(401);
    });

    it('rejects soft-deleted users', async () => {
        await createUser({ email: 'deleted@example.com', deletedAt: new Date() });

        const result = await accountService.login('deleted@example.com', PLAIN_PASSWORD);

        expect(result.success).toBe(false);
        expect((result as ResponseReject).status).toBe(401);
    });
});

describe('accountService.tokenAdd', () => {
    it('adds a token to the user and returns the token string', async () => {
        const user = await createUser();
        const token = await accountService.tokenAdd(user, 'password-reset', 3_600_000);

        expect(typeof token).toBe('string');
        expect(token).toHaveLength(32);
    });

    it('persists the token to the database', async () => {
        const user = await createUser();
        const id = (user._id as Types.ObjectId).toString();

        await accountService.tokenAdd(user, 'email-verify');

        const refreshed = await userRepository.findByIdWithCredentials(id);
        expect(refreshed!.tokens).toHaveLength(1);
        expect(refreshed!.tokens[0].type).toBe('email-verify');
    });

    it('sets an expiration date when expirationTime is provided', async () => {
        const user = await createUser();
        const id = (user._id as Types.ObjectId).toString();
        const now = Date.now();

        await accountService.tokenAdd(user, 'reset', 3_600_000);

        const refreshed = await userRepository.findByIdWithCredentials(id);
        const expiration = refreshed!.tokens[0].expiration!;
        expect(expiration.getTime()).toBeGreaterThan(now);
    });
});

describe('accountService.passwordChange', () => {
    it('changes the password when both fields match and meet requirements', async () => {
        const user = await createUser();
        const result = await accountService.passwordChange(user, 'NewPassword1!', 'NewPassword1!');

        expect(result.success).toBe(true);
    });

    it('rejects when passwords do not match', async () => {
        const user = await createUser();
        const result = await accountService.passwordChange(user, 'NewPassword1!', 'Different1!');

        expect(result.success).toBe(false);
        expect((result as ResponseReject).status).toBe(422);
    });

    it('rejects when the new password is too short', async () => {
        const user = await createUser();
        const result = await accountService.passwordChange(user, 'abc', 'abc');

        expect(result.success).toBe(false);
        expect((result as ResponseReject).status).toBe(422);
    });

    it('actually changes the password so the new one can be used to log in', async () => {
        const user = await createUser({ email: 'pwdchange@example.com' });
        const id = (user._id as Types.ObjectId).toString();

        await accountService.passwordChange(user, 'BrandNew1!', 'BrandNew1!');

        const refreshed = await userRepository.findById(id);
        const loginResult = await accountService.login('pwdchange@example.com', 'BrandNew1!');
        expect(loginResult.success).toBe(true);
        expect(refreshed).not.toBeNull();
    });
});
