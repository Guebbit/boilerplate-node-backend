/**
 * @module
 * The self-service account surface — profile update, password change, session revocation, email
 * verification — at the service/repository layer, grouped by the invariant each defends: a
 * profile update can't touch role/state/password; a wrong current password is a 422 never a 401
 * (which would log out a valid session); at most one verification link works, always the newest.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/caller-context';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/fixtures';
import {
    accountService,
    passwordChangeWithCurrent,
    updateProfile,
    sendVerificationEmail,
    EMAIL_VERIFY_TOKEN_TYPE
} from '@modules/account/services';
import { userRepository, TokenType } from '@modules/users';
import { asReject, asSuccess } from '@tests/response';
import * as auditPort from '@infrastructure/observability/audit';
import * as analyticsPort from '@infrastructure/observability/analytics';
import { accountAuditActions } from '../../audit';
import { accountAnalyticsEvents } from '../../analytics';
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

/* Replaced for the same reason as the audit port above. */
jest.mock('@infrastructure/observability/analytics', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/analytics'),
    emitAnalyticsEvent: jest.fn()
}));

setupTestDb();

afterEach(() => jest.restoreAllMocks());

const CURRENT_PASSWORD = 'correct-horse-battery';
const NEW_PASSWORD = 'staple-gun-tuesday';

/** The stored tokens of a user, credentials re-selected. */
const readTokens = async (userId: string) => {
    const stored = await userRepository.findByIdWithCredentials(userId);
    return stored?.tokens ?? [];
};

describe('updateProfile', () => {
    it('updates the fields a user owns', async () => {
        const user = await createUser({ email: 'own@example.com' });

        const response = asSuccess(
            await updateProfile(user.id, { username: 'renamed', locale: 'it' }, testCallerContext)
        );

        expect(response.data.username).toBe('renamed');
        expect(response.data.locale).toBe('it');
        // Untouched fields stay put — an absent field means "leave it alone".
        expect(response.data.email).toBe('own@example.com');
    });

    it('rejects an invalid email with 422', async () => {
        const user = await createUser();

        const response = asReject(
            await updateProfile(user.id, { email: 'not-an-email' }, testCallerContext)
        );

        expect(response.status).toBe(422);
    });

    it('answers 404 for an account that no longer exists', async () => {
        const user = await createUser();
        await userRepository.deleteOne(user);

        const response = asReject(
            await updateProfile(user.id, { username: 'ghost' }, testCallerContext)
        );

        expect(response.status).toBe(404);
    });

    it('cannot escalate: admin, active and password do not pass through', async () => {
        const user = await createUser();

        asSuccess(
            await updateProfile(
                user.id,
                {
                    username: 'still-plain',
                    admin: true,
                    active: false,
                    password: 'injected-password'
                },
                testCallerContext
            )
        );

        const stored = await userRepository.findByIdWithCredentials(user.id);
        expect(stored?.admin).toBe(false);
        expect(stored?.active).toBe(true);
        // The password is untouched — the fixture's original still logs in.
        const login = await accountService.login(user.email, PLAIN_PASSWORD);
        expect(login.success).toBe(true);
    });

    it('unverifies the account when the email changes', async () => {
        const user = await createUser({ email: 'before@example.com', verified: true });

        const response = asSuccess(
            await updateProfile(user.id, { email: 'after@example.com' }, testCallerContext)
        );

        expect(response.data.verified).toBe(false);
    });

    it('keeps the verification when the email is restated unchanged', async () => {
        const user = await createUser({ email: 'same@example.com', verified: true });

        const response = asSuccess(
            await updateProfile(user.id, { email: 'same@example.com' }, testCallerContext)
        );

        expect(response.data.verified).toBe(true);
    });

    it('answers the unique index with 409 when the email belongs to someone else', async () => {
        await createUser({ email: 'taken@example.com', username: 'first' });
        const user = await createUser({ email: 'second@example.com', username: 'second' });

        const response = asReject(
            await updateProfile(user.id, { email: 'taken@example.com' }, testCallerContext)
        );

        expect(response.status).toBe(409);
    });
});

describe('passwordChangeWithCurrent', () => {
    it('changes the password when the current one matches', async () => {
        const user = await createUser({ password: CURRENT_PASSWORD });

        asSuccess(
            await passwordChangeWithCurrent(
                user.id,
                CURRENT_PASSWORD,
                NEW_PASSWORD,
                NEW_PASSWORD,
                testCallerContext
            )
        );

        // The new credential works and the old one is dead — both directions, or the test
        // passes on a no-op.
        const withNew = await accountService.login(user.email, NEW_PASSWORD);
        const withOld = await accountService.login(user.email, CURRENT_PASSWORD);
        expect(withNew.success).toBe(true);
        expect(withOld.success).toBe(false);
    });

    it('answers a wrong current password with 422, not 401', async () => {
        const user = await createUser({ password: CURRENT_PASSWORD });

        const response = asReject(
            await passwordChangeWithCurrent(
                user.id,
                'wrong-guess',
                NEW_PASSWORD,
                NEW_PASSWORD,
                testCallerContext
            )
        );

        expect(response.status).toBe(422);
        // And nothing changed.
        const login = await accountService.login(user.email, CURRENT_PASSWORD);
        expect(login.success).toBe(true);
    });

    it('validates the new pair before spending a bcrypt comparison', async () => {
        const user = await createUser({ password: CURRENT_PASSWORD });

        const response = asReject(
            await passwordChangeWithCurrent(
                user.id,
                CURRENT_PASSWORD,
                NEW_PASSWORD,
                'different',
                testCallerContext
            )
        );

        expect(response.status).toBe(422);
        const login = await accountService.login(user.email, CURRENT_PASSWORD);
        expect(login.success).toBe(true);
    });
});

describe('sessionRemove', () => {
    it('revokes exactly the named refresh token', async () => {
        const user = await createUser();
        await user.tokenAdd(TokenType.REFRESH, 60_000, 'refresh-a');
        await user.tokenAdd(TokenType.REFRESH, 60_000, 'refresh-b');

        const tokens = await readTokens(user.id);
        const target = tokens.find((token) => token.token === 'refresh-a');

        const result = await userRepository.sessionRemove(user.id, String(target?._id));

        expect(result.modifiedCount).toBe(1);
        const remaining = await readTokens(user.id);
        expect(remaining.map(({ token }) => token)).toEqual(['refresh-b']);
    });

    it('does not reach the other token kinds through a session handle', async () => {
        const user = await createUser();
        await user.tokenAdd('password', 60_000, 'pending-reset');

        const tokens = await readTokens(user.id);
        const result = await userRepository.sessionRemove(user.id, String(tokens[0]?._id));

        expect(result.modifiedCount).toBe(0);
        expect(await readTokens(user.id)).toHaveLength(1);
    });

    it("cannot revoke another user's session", async () => {
        const owner = await createUser({ email: 'owner@example.com', username: 'owner' });
        const attacker = await createUser({ email: 'attacker@example.com', username: 'attacker' });
        await owner.tokenAdd(TokenType.REFRESH, 60_000, 'owner-session');

        const [ownerToken] = await readTokens(owner.id);
        const result = await userRepository.sessionRemove(attacker.id, String(ownerToken?._id));

        expect(result.modifiedCount).toBe(0);
        expect(await readTokens(owner.id)).toHaveLength(1);
    });
});

describe('sessionRevoke', () => {
    it('audits a revoke that actually matched a token', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser();
        await user.tokenAdd(TokenType.REFRESH, 60_000, 'refresh-a');
        const [target] = await readTokens(user.id);

        const result = await accountService.sessionRevoke(
            user.id,
            String(target?._id),
            testCallerContext
        );

        expect(result.modifiedCount).toBe(1);
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_SESSION_REVOKED,
                outcome: 'success'
            })
        );
    });

    it('does not audit a revoke that matched nothing — an invented id must not misrepresent one', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser();

        const result = await accountService.sessionRevoke(
            user.id,
            String(user._id),
            testCallerContext
        );

        expect(result.modifiedCount).toBe(0);
        expect(auditSpy).not.toHaveBeenCalled();
    });
});

describe('tokenRemoveByValue', () => {
    it('removes one session and leaves the siblings', async () => {
        const user = await createUser();
        await user.tokenAdd(TokenType.REFRESH, 60_000, 'phone');
        await user.tokenAdd(TokenType.REFRESH, 60_000, 'laptop');

        await userRepository.tokenRemoveByValue('phone');

        const remaining = await readTokens(user.id);
        expect(remaining.map(({ token }) => token)).toEqual(['laptop']);
    });

    it('reports an already-spent value as a no-op', async () => {
        const result = await userRepository.tokenRemoveByValue('never-issued');

        expect(result.modifiedCount).toBe(0);
    });
});

describe('logoutCurrentSession', () => {
    it('revokes the named refresh token and records the logout', async () => {
        // Reported HERE and not by the paired frontend: this is a real request the API answers, so
        // it can count the logout that succeeded rather than the one that was attempted. `scope`
        // separates it from a logout-everywhere without splitting the funnel across two names.
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);
        const user = await createUser();
        await user.tokenAdd(TokenType.REFRESH, 60_000, 'phone');
        await user.tokenAdd(TokenType.REFRESH, 60_000, 'laptop');

        await accountService.logoutCurrentSession('phone', testCallerContext);

        const remaining = await readTokens(user.id);
        expect(remaining.map(({ token }) => token)).toEqual(['laptop']);
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_LOGGED_OUT,
                outcome: 'success'
            })
        );
        expect(analyticsSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                event: accountAnalyticsEvents.USER_LOGGED_OUT,
                properties: { scope: 'session' }
            })
        );
    });

    it('records the logout even with no cookie to revoke', async () => {
        // `getRefreshToken` answers 200 for "already logged out here" — the audit event fires
        // either way, matching that: there is simply nothing to revoke.
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);

        await accountService.logoutCurrentSession(undefined, testCallerContext);

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_LOGGED_OUT,
                outcome: 'success'
            })
        );
        expect(analyticsSpy).toHaveBeenCalledWith(
            expect.objectContaining({ event: accountAnalyticsEvents.USER_LOGGED_OUT })
        );
    });
});

describe('sendVerificationEmail', () => {
    it('issues exactly one verify token, replacing any earlier one', async () => {
        const user = await createUser();

        await sendVerificationEmail(user, testCallerContext);
        const firstTokens = await readTokens(user.id);
        const first = firstTokens.find(({ type }) => type === EMAIL_VERIFY_TOKEN_TYPE);

        await sendVerificationEmail(user, testCallerContext);
        const secondTokens = await readTokens(user.id);
        const verifyTokens = secondTokens.filter(({ type }) => type === EMAIL_VERIFY_TOKEN_TYPE);

        // One live link at any moment, and it is the NEWEST one — the re-send exists for the
        // user whose first mail vanished.
        expect(verifyTokens).toHaveLength(1);
        expect(verifyTokens[0]?.token).not.toBe(first?.token);
    });

    it('leaves the other token kinds alone', async () => {
        const user = await createUser();
        await user.tokenAdd(TokenType.REFRESH, 60_000, 'live-session');

        await sendVerificationEmail(user, testCallerContext);

        const tokens = await readTokens(user.id);
        expect(tokens.find(({ token }) => token === 'live-session')).toBeDefined();
    });
});

describe('requestEmailVerification', () => {
    it('sends the mail and audits the explicit re-send', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser();

        await accountService.requestEmailVerification(user, testCallerContext);

        const tokens = await readTokens(user.id);
        expect(tokens.some(({ type }) => type === EMAIL_VERIFY_TOKEN_TYPE)).toBe(true);
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_EMAIL_VERIFY_REQUESTED,
                outcome: 'success'
            })
        );
    });
});

describe('completeEmailVerification', () => {
    it('marks the account verified and audits it', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ verified: false });

        const saved = await accountService.completeEmailVerification(user, testCallerContext);

        expect(saved.verified).toBe(true);
        const stored = await userRepository.findById(user.id);
        expect(stored?.verified).toBe(true);
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_EMAIL_VERIFY_COMPLETED,
                actor_user_id: user.id,
                outcome: 'success'
            })
        );
    });
});

describe('getOwnProfile', () => {
    it('reports a view and returns the profile', async () => {
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);
        const user = await createUser({ email: 'viewer@example.com' });

        const profile = await accountService.getOwnProfile(user.id, testCallerContext);

        expect(profile?.email).toBe('viewer@example.com');
        expect(analyticsSpy).toHaveBeenCalledWith(
            expect.objectContaining({ event: accountAnalyticsEvents.USER_PROFILE_VIEWED })
        );
    });
});

describe('removeOwnAccount', () => {
    it('hard-deletes the account and reports it', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);
        const user = await createUser();

        const result = await accountService.removeOwnAccount(user, testCallerContext);

        expect(result.success).toBe(true);
        expect(await userRepository.findById(user.id)).toBeNull();
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_ACCOUNT_DELETE_COMPLETED,
                actor_user_id: user.id,
                outcome: 'success'
            })
        );
        expect(analyticsSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                event: accountAnalyticsEvents.ACCOUNT_DELETED,
                distinctId: user.id
            })
        );
    });
});

describe('passwordResetChange', () => {
    it('changes the password and audits a reset completion, distinct from a logged-in change', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ password: CURRENT_PASSWORD });

        asSuccess(
            await accountService.passwordResetChange(
                user,
                NEW_PASSWORD,
                NEW_PASSWORD,
                testCallerContext
            )
        );

        const withNew = await accountService.login(user.email, NEW_PASSWORD);
        expect(withNew.success).toBe(true);
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_PASSWORD_RESET_COMPLETED,
                outcome: 'success'
            })
        );
    });

    it('does not audit a rejected pair', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ password: CURRENT_PASSWORD });

        const response = asReject(
            await accountService.passwordResetChange(
                user,
                NEW_PASSWORD,
                'different',
                testCallerContext
            )
        );

        expect(response.status).toBe(422);
        expect(auditSpy).not.toHaveBeenCalled();
    });
});

describe('requestAccountDeletion', () => {
    it('issues a delete token and audits the request', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser();

        await accountService.requestAccountDeletion(user, testCallerContext);

        /*
         * The token value is deliberately NOT returned any more — it goes straight into the mail
         * this function publishes, so a caller cannot hold a live delete credential. What is
         * observable is that exactly one was stored.
         */
        const tokens = await readTokens(user.id);
        expect(tokens.filter(({ type }) => type === 'delete')).toHaveLength(1);
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_ACCOUNT_DELETE_REQUESTED,
                actor_user_id: user.id,
                outcome: 'success'
            })
        );
    });
});

/**
 * What makes a one-time token LIVE, asserted where the rule now lives.
 *
 * Three controllers used to carry a copy of this check and answer 422 from it; those copies are
 * gone, so this is the only place the rule is stated and the only place it can be proven. The
 * cases below are exactly the four a caller must not be able to tell apart — see the note on
 * refusals in `services/tokens.ts`.
 */
describe('findLiveToken', () => {
    it('finds the holder of a live token of the right type', async () => {
        const user = await createUser();
        await user.tokenAdd('password', 3_600_000, 'live-reset');

        const found = await accountService.findLiveToken('password', 'live-reset');

        expect(found?.id).toBe(user.id);
    });

    it('refuses a token of another type, so one link cannot be spent as another', async () => {
        const user = await createUser();
        await user.tokenAdd('delete', 3_600_000, 'delete-token');

        await expect(
            accountService.findLiveToken('password', 'delete-token')
        ).resolves.toBeUndefined();
    });

    it('refuses an expired token', async () => {
        /*
         * Seeded with a past `expiration` rather than issued through `tokenAdd`, because
         * `tokenAdd` CANNOT produce this state: a non-positive TTL stores `expiration: undefined`
         * — "no deadline" — which is the case below, not this one. The state under test is the
         * one a link reaches by sitting in an inbox overnight, and only the stored document can
         * express it.
         */
        await createUser({
            tokens: [
                { type: 'password', token: 'stale-reset', expiration: new Date(Date.now() - 1000) }
            ]
        });

        await expect(
            accountService.findLiveToken('password', 'stale-reset')
        ).resolves.toBeUndefined();
    });

    it('keeps a token with no expiration, which never expires', async () => {
        const user = await createUser();
        // `tokenAdd` stores no expiration for a non-positive TTL, so this is the state that
        // reaches the check — treating absent as "already past" would revoke exactly these.
        await user.tokenAdd('password', 0, 'eternal');

        const found = await accountService.findLiveToken('password', 'eternal');

        expect(found?.id).toBe(user.id);
    });

    it('refuses a token that never existed', async () => {
        await createUser();

        await expect(accountService.findLiveToken('password', 'invented')).resolves.toBeUndefined();
    });
});

/**
 * Spending is what settles a race, and it is deliberately a second call — see `services/tokens.ts`
 * for why `post-reset-confirm` needs to validate a password between the two.
 */
describe('spendLiveToken', () => {
    it('reports true once and false thereafter, so two clicks cannot both win', async () => {
        const user = await createUser();
        await user.tokenAdd('password', 3_600_000, 'one-shot');
        const found = await accountService.findLiveToken('password', 'one-shot');

        await expect(accountService.spendLiveToken(found!, 'one-shot')).resolves.toBe(true);
        await expect(accountService.spendLiveToken(found!, 'one-shot')).resolves.toBe(false);
    });

    it('leaves a spent token unfindable', async () => {
        const user = await createUser();
        await user.tokenAdd('password', 3_600_000, 'burn-me');
        const found = await accountService.findLiveToken('password', 'burn-me');
        await accountService.spendLiveToken(found!, 'burn-me');

        await expect(accountService.findLiveToken('password', 'burn-me')).resolves.toBeUndefined();
    });
});
