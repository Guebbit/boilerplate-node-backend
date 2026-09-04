/**
 * @module
 * `services/index.ts` flows: signup, login, token add and password change. The sibling
 * `service.test.ts` covers this file's security invariants; this covers the ordinary paths they
 * sit on — a signup that succeeds, a login that returns a user, a token that's added, a password
 * that changes — plus the argument-level rejections in front of them, driving a real database via
 * `setupTestDb`. Lives here rather than with `users` because the code under test is `account`'s.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/caller-context';
import { createUser, PLAIN_PASSWORD, REPLACEMENT_PASSWORD } from '@modules/users/tests/fixtures';
import * as accountService from '@modules/account/services';
// The namespace above is this file's house style, and `refreshAccessToken` is published on the
// service object rather than as a bare name — so it is reached through the object, not the barrel.
import { accountService as account } from '@modules/account/services';
import * as auditPort from '@infrastructure/observability/audit';
import { createRefreshToken, verifyAccessToken } from '@modules/account/session/jwt';
import { accountAuditActions } from '../../audit';
import { userRepository } from '@modules/users';
import type { UserDocument } from '@modules/users';
import type { ResponseSuccess, ResponseReject } from '@infrastructure/http/response';
import { observePort } from '@tests/ports';

/*
 * The audit port is REPLACED, not spied on: `jest.spyOn` cannot redefine the non-configurable
 * getter a CommonJS namespace import exposes, which fails under `jest.config.mutation.js`'s swc
 * transform and inside Stryker's sandbox. See `tests/support/ports.ts` for the full reasoning.
 */
jest.mock('@infrastructure/observability/audit', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/audit'),
    emitAuditEvent: jest.fn()
}));

setupTestDb();

describe('accountService.signup', () => {
    it('creates a new user and returns a success response', async () => {
        const result = await accountService.signup(
            {
                email: 'new@example.com',
                username: 'newuser',
                password: PLAIN_PASSWORD,
                passwordConfirm: PLAIN_PASSWORD,
                analyticsConsent: undefined,
                termsAccepted: true,
                imageUrl: undefined,
                thumbnailUrl: undefined,
                pendingImageKey: undefined
            },
            testCallerContext
        );

        expect(result.success).toBe(true);
        expect((result as ResponseSuccess<UserDocument>).data!.email).toBe('new@example.com');
    });

    it('rejects when passwords do not match', async () => {
        const result = await accountService.signup(
            {
                email: 'new@example.com',
                username: 'newuser',
                password: PLAIN_PASSWORD,
                passwordConfirm: 'Different1!',
                analyticsConsent: undefined,
                termsAccepted: true,
                imageUrl: undefined,
                thumbnailUrl: undefined,
                pendingImageKey: undefined
            },
            testCallerContext
        );

        expect(result.success).toBe(false);
        expect((result as ResponseReject).errors).toHaveLength(1);
    });

    it('rejects with 409 when the email is already registered', async () => {
        await createUser({ email: 'taken@example.com' });

        const result = await accountService.signup(
            {
                email: 'taken@example.com',
                username: 'anotheruser',
                password: PLAIN_PASSWORD,
                passwordConfirm: PLAIN_PASSWORD,
                analyticsConsent: undefined,
                termsAccepted: true,
                imageUrl: undefined,
                thumbnailUrl: undefined,
                pendingImageKey: undefined
            },
            testCallerContext
        );

        expect(result.success).toBe(false);
        expect((result as ResponseReject).status).toBe(409);
    });

    it('rejects with 422 when the email format is invalid', async () => {
        const result = await accountService.signup(
            {
                email: 'not-an-email',
                username: 'user',
                password: PLAIN_PASSWORD,
                passwordConfirm: PLAIN_PASSWORD,
                analyticsConsent: undefined,
                termsAccepted: true,
                imageUrl: undefined,
                thumbnailUrl: undefined,
                pendingImageKey: undefined
            },
            testCallerContext
        );

        expect(result.success).toBe(false);
        // 422 across the board for validation failures, auth included — that is what
        // openapi.yaml declares, and it never declares 400 at all.
        expect((result as ResponseReject).status).toBe(422);
    });

    it('rejects with 422 when the password is too short', async () => {
        const result = await accountService.signup(
            {
                email: 'short@example.com',
                username: 'shortpwd',
                password: 'abc',
                passwordConfirm: 'abc',
                analyticsConsent: undefined,
                termsAccepted: true,
                imageUrl: undefined,
                thumbnailUrl: undefined,
                pendingImageKey: undefined
            },
            testCallerContext
        );

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
        const id = user._id.toString();

        await accountService.tokenAdd(user, 'email-verify');

        const refreshed = await userRepository.findByIdWithCredentials(id);
        expect(refreshed!.tokens).toHaveLength(1);
        expect(refreshed!.tokens[0].type).toBe('email-verify');
    });

    it('sets an expiration date when expirationTime is provided', async () => {
        const user = await createUser();
        const id = user._id.toString();
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
        const result = await accountService.passwordChange(
            user,
            REPLACEMENT_PASSWORD,
            REPLACEMENT_PASSWORD
        );

        expect(result.success).toBe(true);
    });

    it('rejects when passwords do not match', async () => {
        const user = await createUser();
        const result = await accountService.passwordChange(
            user,
            REPLACEMENT_PASSWORD,
            PLAIN_PASSWORD
        );

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
        const id = user._id.toString();

        await accountService.passwordChange(user, 'BrandNew1!', 'BrandNew1!');

        const refreshed = await userRepository.findById(id);
        const loginResult = await accountService.login('pwdchange@example.com', 'BrandNew1!');
        expect(loginResult.success).toBe(true);
        expect(refreshed).not.toBeNull();
    });
});

/**
 * A user holding one real, stored refresh token — what the refresh cookie would have carried.
 * `createRefreshToken`'s OWN return value, not a re-read from storage: `tokens[].token` is a
 * `hashToken` digest at rest, never the plaintext JWT.
 */
const issueRefreshToken = async () => {
    const user = await createUser({ email: 'refresh@example.com', username: 'refresher' });
    return createRefreshToken(user.id);
};

/**
 * `refreshAccessToken` — the three outcomes of exchanging a refresh cookie, and the record each
 * leaves. Driven off a real signed token, not a stub: verification consults the user document,
 * so a mocked verifier would let a revoked token pass. Secrets are set here for the same reason
 * `jwt.test.ts` sets them — unit tests don't load dotenv.
 */
describe('accountService.refreshAccessToken', () => {
    const ENV_KEYS = [
        'NODE_TOKEN_ACCESS',
        'NODE_TOKEN_REFRESH',
        'NODE_TOKEN_ACCESS_TIME',
        'NODE_TOKEN_REFRESH_TIME_SHORT',
        'NODE_TOKEN_ROTATION_GRACE_MS'
    ] as const;
    const originalEnvironment: Record<string, string | undefined> = {};

    beforeEach(() => {
        for (const key of ENV_KEYS) originalEnvironment[key] = process.env[key];
        process.env.NODE_TOKEN_ACCESS = 'test-access-secret';
        process.env.NODE_TOKEN_REFRESH = 'test-refresh-secret';
        process.env.NODE_TOKEN_ACCESS_TIME = '900';
        process.env.NODE_TOKEN_REFRESH_TIME_SHORT = '3600';
    });

    afterEach(() => {
        for (const key of ENV_KEYS) {
            if (originalEnvironment[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnvironment[key];
        }
        jest.restoreAllMocks();
    });

    it('returns an access token and records the refresh', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const refreshToken = await issueRefreshToken();

        const result = await account.refreshAccessToken(refreshToken, testCallerContext);

        expect(typeof result.accessToken).toBe('string');
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_TOKEN_REFRESHED,
                outcome: 'success'
            })
        );
    });

    // The whole point of rotation: the refresh token's VALUE changes on every
    // exchange, so a stolen cookie stops being silently reusable for as long as it has left to live.
    it('rotates the refresh token — the new value replaces the old one, which stops working', async () => {
        const refreshToken = await issueRefreshToken();

        const result = await account.refreshAccessToken(refreshToken, testCallerContext);

        expect(result.refreshToken).not.toBe(refreshToken);
        // The new token works…
        await expect(
            account.refreshAccessToken(result.refreshToken, testCallerContext)
        ).resolves.toBeDefined();
    });

    // The property the step-up freshness gate depends on. Ten
    // rotations in a row, and `auth_time` on the access token stays byte-identical to the one the
    // very first login stamped: a client that refreshes on every 401 must never be "freshened" by
    // that alone.
    it('does not move auth_time across ten consecutive refreshes', async () => {
        const refreshToken = await issueRefreshToken();
        const first = await account.refreshAccessToken(refreshToken, testCallerContext);
        const { auth_time: mintedAt } = await verifyAccessToken(first.accessToken);

        // Chained from `first.refreshToken`, not the original: each iteration presents the
        // PREVIOUS iteration's newly-rotated token, so this is ten genuine sequential rotations,
        // not one rotation plus nine grace-window reissues of the same already-spent token.
        let current = first.refreshToken;
        for (let i = 0; i < 10; i++) {
            const result = await account.refreshAccessToken(current, testCallerContext);
            const { auth_time: authTime } = await verifyAccessToken(result.accessToken);
            expect(authTime).toBe(mintedAt);
            current = result.refreshToken;
        }
    });

    it('reissues rather than rejects a token replayed within the rotation grace window', async () => {
        // Two tabs racing to refresh with the SAME cookie: both requests present `refreshToken`,
        // and both must succeed — this is what stops a benign race from reading as theft.
        const refreshToken = await issueRefreshToken();

        const [first, second] = await Promise.all([
            account.refreshAccessToken(refreshToken, testCallerContext),
            account.refreshAccessToken(refreshToken, testCallerContext)
        ]);

        expect(typeof first.accessToken).toBe('string');
        expect(typeof second.accessToken).toBe('string');
        // Both got a working, DIFFERENT refresh token — not the same one twice.
        expect(first.refreshToken).not.toBe(second.refreshToken);
    });

    it('treats a token replayed after its rotation grace window as reuse, and revokes every session', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ email: 'reuse@example.com' });
        // A second, unrelated live session — this is what proves the revoke is account-wide, not
        // just the one token.
        const other = await createRefreshToken(user.id);
        const refreshToken = await createRefreshToken(user.id);

        await account.refreshAccessToken(refreshToken, testCallerContext);

        // A zero-length grace window: by the time this next call re-reads the entry, ANY elapsed
        // time counts as outside it — the same test technique `jwt.test.ts` would use, without
        // reaching into `users`' storage to back-date a timestamp by hand.
        process.env.NODE_TOKEN_ROTATION_GRACE_MS = '0';

        await expect(account.refreshAccessToken(refreshToken, testCallerContext)).rejects.toThrow(
            'reuse'
        );
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_REFRESH_TOKEN_REUSE_DETECTED,
                actor_user_id: user.id,
                outcome: 'failure'
            })
        );

        // The unrelated session from before is gone too — the WHOLE refresh set, not just the one.
        await expect(account.refreshAccessToken(other, testCallerContext)).rejects.toThrow();
    });

    it('records a token that does not verify as an invalid_token failure', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await expect(account.refreshAccessToken('not-a-jwt', testCallerContext)).rejects.toThrow();

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_TOKEN_REFRESHED,
                outcome: 'failure',
                metadata: { reason: 'invalid_token' }
            })
        );
    });

    // A signed token the user no longer holds. Revocation lives in the document, not the
    // signature, so this is the case that proves logout is more than cosmetic.
    it('records a revoked token as invalid rather than refreshing it', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const refreshToken = await issueRefreshToken();
        await userRepository.tokenRemoveByValue(refreshToken);

        await expect(account.refreshAccessToken(refreshToken, testCallerContext)).rejects.toThrow();

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_TOKEN_REFRESHED,
                outcome: 'failure',
                metadata: { reason: 'invalid_token' }
            })
        );
    });

    it('records a missing cookie as a missing_token failure, distinctly', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await expect(account.refreshAccessToken(undefined, testCallerContext)).rejects.toThrow();

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_TOKEN_REFRESHED,
                actor_user_id: 'anonymous',
                outcome: 'failure',
                metadata: { reason: 'missing_token' }
            })
        );
    });
});
