/**
 * @module
 * The self-service account surface — profile update, password change, session revocation, email
 * verification — at the service/repository layer, grouped by the invariant each defends: a
 * profile update can't touch role/state/password; a wrong current password is a 422 never a 401
 * (which would log out a valid session); at most one verification link works, always the newest.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import {
    createUser,
    PASSPHRASE_PASSWORD,
    REPLACEMENT_PASSWORD
} from '@modules/users/tests/factories';
import {
    accountService,
    passwordChangeWithCurrent,
    updateProfile,
    sendVerificationEmail,
    PASSWORD_RESET_TOKEN_TYPE,
    RESET_REQUEST_SECONDS,
    EMAIL_VERIFY_TOKEN_TYPE,
    EMAIL_CHANGE_TOKEN_TYPE,
    VERIFY_RESEND_SECONDS,
    completeEmailChange
} from '@modules/account/services';
import { hashToken } from '@infrastructure/security/hash-token';
import { userRepository } from '@modules/users/tests/factories';
import { asReject, asSuccess } from '@tests/response';
import * as auditPort from '@infrastructure/observability/audit';
import * as analyticsPort from '@infrastructure/observability/analytics';
import { accountAuditActions } from '../../audit';
import { accountAnalyticsEvents } from '../../analytics';
import { observePort } from '@tests/ports';
import { MISSING_ID } from '@tests/ids';
import { rolesOf } from '@modules/access';
import * as accessPort from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { logger } from '@infrastructure/adapters/logger';
import { imageStore } from '@infrastructure/adapters/image-store';
import { ageTokenSend, plantSession, plantToken, sessionRowsOf, tokenRowsOf } from '../factories';

/*
 * The audit port is REPLACED, not spied on: `jest.spyOn` cannot redefine the non-configurable
 * getter a CommonJS namespace import exposes, which fails under `jest.config.mutation.js`'s swc
 * transform and inside Stryker's sandbox. See `tests/support/ports.ts` for the full reasoning.
 */
jest.mock('@infrastructure/observability/audit', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/audit')>(
        '@infrastructure/observability/audit'
    );
    const emitAuditEvent = jest.fn();
    return {
        __esModule: true,
        ...actual,
        emitAuditEvent,
        // `recordAudit` closes over its own module's real `emitAuditEvent`, immune to the
        // override above — reroute it through the replacement so a spy on `emitAuditEvent` still
        // sees every `recordAudit` call, exactly as it saw every direct one before.
        recordAudit: (
            context: Parameters<typeof actual.recordAudit>[0],
            fields: Parameters<typeof actual.recordAudit>[1]
        ) => {
            if (!context) return;
            emitAuditEvent(actual.buildAuditEvent(context, fields));
        }
    };
});

/* Replaced for the same reason as the audit port above. */
jest.mock('@infrastructure/observability/analytics', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/analytics'),
    emitAnalyticsEvent: jest.fn()
}));

/*
 * Same non-configurable-getter reason as the two ports above — `rolesOf` is wrapped in a
 * `jest.fn` that CALLS THROUGH to the real implementation by default (every other describe block
 * here needs the genuine membership lookup), so only the one case that overrides it with
 * `mockRejectedValueOnce` ever sees anything else.
 */
jest.mock('@modules/access', () => {
    const actual = jest.requireActual<typeof import('@modules/access')>('@modules/access');
    return { __esModule: true, ...actual, rolesOf: jest.fn(actual.rolesOf) };
});

setupTestDb();

afterEach(() => jest.restoreAllMocks());

/** The one-time tokens an account holds, as stored rows. */
const readTokens = tokenRowsOf;

/** The id a stored session is revoked by, from a lookup that may have found nothing. */
const sessionIdOfRow = (row: { familyId: unknown } | undefined): string =>
    row ? String(row.familyId) : '';

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

    it('unsets the avatar on `imageUrl: null` and deletes the old file after the save', async () => {
        const remove = jest.spyOn(imageStore, 'remove').mockResolvedValue(true);
        const user = await createUser({
            imageUrl: '/images/mine.png',
            thumbnailUrl: '/images/thumbs/v1/mine.webp'
        });

        const response = asSuccess(
            await updateProfile(user.id, { imageUrl: null }, testCallerContext)
        );

        expect(response.data.imageUrl).toBeUndefined();
        const stored = await userRepository.findOne({ _id: user.id });
        expect(stored?.imageUrl).toBeUndefined();
        expect(stored?.thumbnailUrl).toBeUndefined();
        // The store derives the thumbnail from the main url, so one call covers both files.
        expect(remove).toHaveBeenCalledWith('/images/mine.png');
        remove.mockRestore();
    });

    it('answers 401, not 404, for an account that no longer exists', async () => {
        // A verified token for a deleted account is unauthenticated, not missing — `openapi.yaml`
        // declares no 404 on `PUT/PATCH /account`, and `isAuth` treats this exact case as 401 everywhere else.
        const user = await createUser();
        await userRepository.deleteOne(user);

        const response = asReject(
            await updateProfile(user.id, { username: 'ghost' }, testCallerContext)
        );

        expect(response.status).toBe(401);
    });

    it('holds the new address as pendingEmail, and does not touch email or verifiedAt', async () => {
        const user = await createUser({ email: 'before@example.com', verifiedAt: new Date() });

        const response = asSuccess(
            await updateProfile(user.id, { email: 'after@example.com' }, testCallerContext)
        );

        expect(response.data.email).toBe('before@example.com');
        expect(response.data.pendingEmail).toBe('after@example.com');
        expect(response.data.verifiedAt).toEqual(user.verifiedAt);
    });

    it('keeps the verification when the email is restated unchanged', async () => {
        const user = await createUser({ email: 'same@example.com', verifiedAt: new Date() });

        const response = asSuccess(
            await updateProfile(user.id, { email: 'same@example.com' }, testCallerContext)
        );

        expect(response.data.verifiedAt).toEqual(user.verifiedAt);
        expect(response.data.pendingEmail).toBeUndefined();
    });

    it('restating the current address in a different case is a no-op too', async () => {
        const user = await createUser({ email: 'same@example.com', verifiedAt: new Date() });

        const response = asSuccess(
            await updateProfile(user.id, { email: 'SAME@Example.com' }, testCallerContext)
        );

        expect(response.data.verifiedAt).toEqual(user.verifiedAt);
        expect(response.data.pendingEmail).toBeUndefined();
    });

    it('restating the CURRENT address is a no-op — a pending change survives it', async () => {
        const user = await createUser({ email: 'before@example.com', verifiedAt: new Date() });
        await updateProfile(user.id, { email: 'after@example.com' }, testCallerContext);

        const response = asSuccess(
            await updateProfile(user.id, { email: 'before@example.com' }, testCallerContext)
        );

        expect(response.data.pendingEmail).toBe('after@example.com');
        const stored = await userRepository.findByIdWithCredentials(user.id);
        expect(stored?.pendingEmail).toBe('after@example.com');
    });

    it('restating the PENDING address is a no-op — the link already mailed stays valid', async () => {
        const user = await createUser({ email: 'before@example.com', verifiedAt: new Date() });
        await updateProfile(user.id, { email: 'after@example.com' }, testCallerContext);
        const emailChangeToken = () =>
            readTokens(user.id).then(
                (tokens) =>
                    tokens.find((token) => token.type === EMAIL_CHANGE_TOKEN_TYPE)?.tokenHash
            );
        const mailed = await emailChangeToken();

        await updateProfile(user.id, { email: 'AFTER@example.com' }, testCallerContext);

        expect(mailed).toBeDefined();
        expect(await emailChangeToken()).toBe(mailed);
    });

    it('answers the request-time collision check with 409 when the address belongs to someone else', async () => {
        await createUser({ email: 'taken@example.com', username: 'first' });
        const user = await createUser({ email: 'second@example.com', username: 'second' });

        const response = asReject(
            await updateProfile(user.id, { email: 'taken@example.com' }, testCallerContext)
        );

        expect(response.status).toBe(409);
    });

    it("answers 409 when the address is ALREADY someone else's pendingEmail", async () => {
        const first = await createUser({ email: 'first@example.com', username: 'first' });
        await updateProfile(first.id, { email: 'contested@example.com' }, testCallerContext);
        const second = await createUser({ email: 'second@example.com', username: 'second' });

        const response = asReject(
            await updateProfile(second.id, { email: 'contested@example.com' }, testCallerContext)
        );

        expect(response.status).toBe(409);
    });
});

describe('cancelPendingEmailChange', () => {
    it('clears a pending change explicitly', async () => {
        const user = await createUser({ email: 'before@example.com' });
        await updateProfile(user.id, { email: 'after@example.com' }, testCallerContext);

        const response = asSuccess(
            await accountService.cancelPendingEmailChange(user.id, testCallerContext)
        );

        expect(response.data.pendingEmail).toBeUndefined();
        const stored = await userRepository.findByIdWithCredentials(user.id);
        expect(stored?.pendingEmail).toBeUndefined();
        expect(stored?.email).toBe('before@example.com');
    });

    it('is a no-op when nothing is pending', async () => {
        const user = await createUser({ email: 'before@example.com' });

        const response = asSuccess(
            await accountService.cancelPendingEmailChange(user.id, testCallerContext)
        );

        expect(response.data.pendingEmail).toBeUndefined();
    });

    it('revokes the live email-change token, so the old link can no longer swap the address in', async () => {
        const user = await createUser({ email: 'before@example.com' });
        await updateProfile(user.id, { email: 'after@example.com' }, testCallerContext);
        const beforeCancel = await readTokens(user.id);
        expect(beforeCancel.some((token) => token.type === EMAIL_CHANGE_TOKEN_TYPE)).toBe(true);

        await accountService.cancelPendingEmailChange(user.id, testCallerContext);

        const afterCancel = await readTokens(user.id);
        expect(afterCancel.some((token) => token.type === EMAIL_CHANGE_TOKEN_TYPE)).toBe(false);
    });

    it('audits AUTH_EMAIL_CHANGE_CANCELLED only when a change was actually pending', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ email: 'before@example.com' });

        await accountService.cancelPendingEmailChange(user.id, testCallerContext);
        expect(auditSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({ action: accountAuditActions.AUTH_EMAIL_CHANGE_CANCELLED })
        );

        await updateProfile(user.id, { email: 'after@example.com' }, testCallerContext);
        await accountService.cancelPendingEmailChange(user.id, testCallerContext);

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_EMAIL_CHANGE_CANCELLED,
                outcome: 'success'
            })
        );
    });
});

describe('completeEmailChange', () => {
    it('swaps pendingEmail into email, marks verified, clears pendingEmail, and revokes refresh tokens', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ email: 'before@example.com', verifiedAt: new Date() });
        await plantSession(user.id, 'live-session', { ttlMs: 60_000 });
        await updateProfile(user.id, { email: 'after@example.com' }, testCallerContext);
        const loaded = await userRepository.findByIdWithCredentials(user.id);

        const saved = await completeEmailChange(loaded!, testCallerContext);

        expect(saved.email).toBe('after@example.com');
        expect(saved.verifiedAt).toBeInstanceOf(Date);
        expect(saved.pendingEmail).toBeUndefined();
        const stored = await userRepository.findByIdWithCredentials(user.id);
        expect(stored?.email).toBe('after@example.com');
        expect(stored?.pendingEmail).toBeUndefined();
        expect(await sessionRowsOf(user.id)).toEqual([]);
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_EMAIL_CHANGE_COMPLETED,
                actorUserId: user.id,
                outcome: 'success'
            })
        );
    });
});

describe("`verify` and `email-change` tokens do not do each other's work", () => {
    it('a `verify` token is not found under EMAIL_CHANGE_TOKEN_TYPE', async () => {
        const user = await createUser();
        await plantToken(user.id, EMAIL_VERIFY_TOKEN_TYPE, 'shared-value', { ttlMs: 3_600_000 });

        await expect(
            accountService.findLiveToken(EMAIL_CHANGE_TOKEN_TYPE, 'shared-value')
        ).resolves.toBeUndefined();
    });

    it('an `email-change` token is not found under EMAIL_VERIFY_TOKEN_TYPE', async () => {
        const user = await createUser();
        await plantToken(user.id, EMAIL_CHANGE_TOKEN_TYPE, 'shared-value', { ttlMs: 3_600_000 });

        await expect(
            accountService.findLiveToken(EMAIL_VERIFY_TOKEN_TYPE, 'shared-value')
        ).resolves.toBeUndefined();
    });

    it('sendVerificationEmail(..., EMAIL_CHANGE_TOKEN_TYPE) does nothing without a pendingEmail', async () => {
        const user = await createUser({ email: 'a@example.com' });

        await sendVerificationEmail(user, testCallerContext, EMAIL_CHANGE_TOKEN_TYPE);

        const tokens = await readTokens(user.id);
        expect(tokens.some((token) => token.type === EMAIL_CHANGE_TOKEN_TYPE)).toBe(false);
    });
});

describe('passwordChangeWithCurrent', () => {
    it('changes the password when the current one matches', async () => {
        const user = await createUser({ password: PASSPHRASE_PASSWORD });

        asSuccess(
            await passwordChangeWithCurrent(
                user.id,
                PASSPHRASE_PASSWORD,
                REPLACEMENT_PASSWORD,
                REPLACEMENT_PASSWORD,
                testCallerContext
            )
        );

        // The new credential works and the old one is dead — both directions, or the test
        // passes on a no-op.
        const withNew = await accountService.login(user.email, REPLACEMENT_PASSWORD);
        const withOld = await accountService.login(user.email, PASSPHRASE_PASSWORD);
        expect(withNew.success).toBe(true);
        expect(withOld.success).toBe(false);
    });

    it('answers a wrong current password with 422, not 401', async () => {
        const user = await createUser({ password: PASSPHRASE_PASSWORD });

        const response = asReject(
            await passwordChangeWithCurrent(
                user.id,
                'wrong-guess',
                REPLACEMENT_PASSWORD,
                REPLACEMENT_PASSWORD,
                testCallerContext
            )
        );

        expect(response.status).toBe(422);
        // And nothing changed.
        const login = await accountService.login(user.email, PASSPHRASE_PASSWORD);
        expect(login.success).toBe(true);
    });

    it('validates the new pair before spending a bcrypt comparison', async () => {
        const user = await createUser({ password: PASSPHRASE_PASSWORD });

        const response = asReject(
            await passwordChangeWithCurrent(
                user.id,
                PASSPHRASE_PASSWORD,
                REPLACEMENT_PASSWORD,
                'different',
                testCallerContext
            )
        );

        expect(response.status).toBe(422);
        const login = await accountService.login(user.email, PASSPHRASE_PASSWORD);
        expect(login.success).toBe(true);
    });
});

describe('sessionRevoke', () => {
    it('audits a revoke that actually matched a token', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser();
        await plantSession(user.id, 'refresh-a', { ttlMs: 60_000 });
        const [target] = await sessionRowsOf(user.id);

        const revoked = await accountService.sessionRevoke(
            user.id,
            sessionIdOfRow(target),
            undefined,
            testCallerContext
        );

        expect(revoked).toEqual({ revoked: true, current: false });
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

        const revoked = await accountService.sessionRevoke(
            user.id,
            String(user._id),
            undefined,
            testCallerContext
        );

        expect(revoked).toEqual({ revoked: false, current: false });
        expect(auditSpy).not.toHaveBeenCalled();
    });

    it('says the revoked session was the caller’s own when its credential names that family', async () => {
        const user = await createUser();
        await plantSession(user.id, 'refresh-a', { ttlMs: 60_000 });
        await plantSession(user.id, 'refresh-b', { ttlMs: 60_000 });
        const rows = await sessionRowsOf(user.id);
        const own = rows.find((row) => row.tokenHash === hashToken('refresh-a'));

        const revoked = await accountService.sessionRevoke(
            user.id,
            sessionIdOfRow(own),
            'refresh-a',
            testCallerContext
        );

        expect(revoked).toEqual({ revoked: true, current: true });
        expect(await sessionRowsOf(user.id)).toHaveLength(1);
    });

    it('does not call another device’s session the caller’s own', async () => {
        const user = await createUser();
        await plantSession(user.id, 'refresh-a', { ttlMs: 60_000 });
        await plantSession(user.id, 'refresh-b', { ttlMs: 60_000 });
        const rows = await sessionRowsOf(user.id);
        const other = rows.find((row) => row.tokenHash === hashToken('refresh-b'));

        const revoked = await accountService.sessionRevoke(
            user.id,
            sessionIdOfRow(other),
            'refresh-a',
            testCallerContext
        );

        expect(revoked).toEqual({ revoked: true, current: false });
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
        await plantSession(user.id, 'phone', { ttlMs: 60_000 });
        await plantSession(user.id, 'laptop', { ttlMs: 60_000 });

        await accountService.logoutCurrentSession('phone', testCallerContext);

        const remaining = await sessionRowsOf(user.id);
        expect(remaining.map(({ tokenHash }) => tokenHash)).toEqual([hashToken('laptop')]);
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
        expect(verifyTokens[0]?.tokenHash).not.toBe(first?.tokenHash);
    });

    it('leaves the other token kinds alone', async () => {
        const user = await createUser();
        await plantSession(user.id, 'live-session', { ttlMs: 60_000 });

        await sendVerificationEmail(user, testCallerContext);

        const sessions = await sessionRowsOf(user.id);
        expect(
            sessions.find(({ tokenHash }) => tokenHash === hashToken('live-session'))
        ).toBeDefined();
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

/*
 * `credentialLimiters` carries `skipSuccessfulRequests`, so the route's own budget is never spent
 * by the presses that actually send mail — which is why the cooldown is the service's job.
 */
describe('requestEmailVerificationFor', () => {
    it('sends, and promises when the next send may be asked for', async () => {
        const user = await createUser({}, 'unverified');

        const first = asSuccess(
            await accountService.requestEmailVerificationFor(user.id, testCallerContext)
        );

        expect(first.data?.resendAfter).toBe(VERIFY_RESEND_SECONDS);
    });

    it('refuses a second send inside the cooldown, with the seconds to wait', async () => {
        const user = await createUser({}, 'unverified');
        await accountService.requestEmailVerificationFor(user.id, testCallerContext);

        const second = asReject(
            await accountService.requestEmailVerificationFor(user.id, testCallerContext)
        );

        expect(second.status).toBe(429);
        const [error] = second.errors;
        expect(error).toMatchObject({
            code: 'EMAIL_VERIFY_RESEND_TOO_SOON',
            details: { retryAfter: expect.any(Number) as number }
        });
    });

    it('allows the send again once the cooldown has passed', async () => {
        const user = await createUser({}, 'unverified');
        await accountService.requestEmailVerificationFor(user.id, testCallerContext);

        await ageTokenSend(user.id, EMAIL_VERIFY_TOKEN_TYPE, (VERIFY_RESEND_SECONDS + 1) * 1000);

        asSuccess(await accountService.requestEmailVerificationFor(user.id, testCallerContext));
    });

    it('refuses an account that is already verified, cooldown or not', async () => {
        const user = await createUser({ verifiedAt: new Date() });

        const response = asReject(
            await accountService.requestEmailVerificationFor(user.id, testCallerContext)
        );

        expect(response.status).toBe(409);
    });
});

/**
 * Moves the live `email-change` token's send time into the past, so the cooldown has run out.
 * Ageing the recorded send, rather than a fake clock — `sentAt` is what the cooldown reads.
 */
const ageEmailChangeSend = (userId: string): Promise<void> =>
    ageTokenSend(userId, EMAIL_CHANGE_TOKEN_TYPE, (VERIFY_RESEND_SECONDS + 1) * 1000);

/*
 * The pending address cannot be re-asked for through `PUT/PATCH /account` (a restated pending
 * address is a no-op), so this is the only way a lost link is mailed again. Same cooldown and
 * same send-spends-no-limiter-budget reasoning as `requestEmailVerificationFor` above.
 */
describe('resendPendingEmailVerificationFor', () => {
    it('answers 200 with the cooldown to count down and replaces the live link with a fresh one', async () => {
        const user = await createUser({ email: 'before@example.com', verifiedAt: new Date() });
        await updateProfile(user.id, { email: 'after@example.com' }, testCallerContext);
        const emailChangeToken = () =>
            readTokens(user.id).then(
                (tokens) =>
                    tokens.find((token) => token.type === EMAIL_CHANGE_TOKEN_TYPE)?.tokenHash
            );
        const mailed = await emailChangeToken();
        await ageEmailChangeSend(user.id);

        const response = asSuccess(
            await accountService.resendPendingEmailVerificationFor(user.id, testCallerContext)
        );

        expect(response.status).toBe(200);
        expect(response.data).toEqual({ resendAfter: VERIFY_RESEND_SECONDS });
        const fresh = await emailChangeToken();
        expect(fresh).toBeDefined();
        expect(fresh).not.toBe(mailed);
        // Exactly one live link: the previous one was revoked, not kept beside it.
        const stored = await readTokens(user.id);
        const live = stored.filter((token) => token.type === EMAIL_CHANGE_TOKEN_TYPE);
        expect(live).toHaveLength(1);
    });

    it('leaves the pending address and the current one as they were', async () => {
        const user = await createUser({ email: 'before@example.com', verifiedAt: new Date() });
        await updateProfile(user.id, { email: 'after@example.com' }, testCallerContext);
        await ageEmailChangeSend(user.id);

        await accountService.resendPendingEmailVerificationFor(user.id, testCallerContext);

        const stored = await userRepository.findByIdWithCredentials(user.id);
        expect(stored?.email).toBe('before@example.com');
        expect(stored?.pendingEmail).toBe('after@example.com');
    });

    it('is a no-op when nothing is pending: 200 with nothing to wait, no token minted, nothing audited', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ email: 'before@example.com', verifiedAt: new Date() });

        const response = asSuccess(
            await accountService.resendPendingEmailVerificationFor(user.id, testCallerContext)
        );

        expect(response.status).toBe(200);
        expect(response.data).toEqual({ resendAfter: 0 });
        expect(await readTokens(user.id)).toEqual([]);
        expect(auditSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({ action: accountAuditActions.AUTH_EMAIL_CHANGE_RESENT })
        );
    });

    it('refuses a second send inside the cooldown, with the seconds to wait', async () => {
        const user = await createUser({ email: 'before@example.com', verifiedAt: new Date() });
        // The request itself mailed the first link, so the cooldown is already running.
        await updateProfile(user.id, { email: 'after@example.com' }, testCallerContext);

        const response = asReject(
            await accountService.resendPendingEmailVerificationFor(user.id, testCallerContext)
        );

        expect(response.status).toBe(429);
        const [error] = response.errors;
        expect(error).toMatchObject({
            code: 'EMAIL_VERIFY_RESEND_TOO_SOON',
            details: { retryAfter: expect.any(Number) as number }
        });
    });

    it('is not slowed by a verification link the account asked for separately', async () => {
        // The cooldown reads the `email-change` token, not the signup-kind one — the two buttons
        // do not share a clock.
        const user = await createUser({ email: 'before@example.com' }, 'unverified');
        await accountService.requestEmailVerificationFor(user.id, testCallerContext);
        await updateProfile(user.id, { email: 'after@example.com' }, testCallerContext);
        await ageEmailChangeSend(user.id);

        const response = asSuccess(
            await accountService.resendPendingEmailVerificationFor(user.id, testCallerContext)
        );

        expect(response.status).toBe(200);
    });

    it('audits AUTH_EMAIL_CHANGE_RESENT when a link was actually sent', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ email: 'before@example.com', verifiedAt: new Date() });
        await updateProfile(user.id, { email: 'after@example.com' }, testCallerContext);
        await ageEmailChangeSend(user.id);

        await accountService.resendPendingEmailVerificationFor(user.id, testCallerContext);

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_EMAIL_CHANGE_RESENT,
                outcome: 'success'
            })
        );
    });

    it('answers 401 for an account that no longer exists', async () => {
        const response = asReject(
            await accountService.resendPendingEmailVerificationFor(MISSING_ID, testCallerContext)
        );

        expect(response.status).toBe(401);
    });
});

describe('completeEmailVerification', () => {
    it('marks the account verified and audits it', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({});

        const saved = await accountService.completeEmailVerification(user, testCallerContext);

        expect(saved.verifiedAt).toBeInstanceOf(Date);
        const stored = await userRepository.findById(user.id);
        expect(stored?.verifiedAt).toBeInstanceOf(Date);
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_EMAIL_VERIFY_COMPLETED,
                actorUserId: user.id,
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
                actorUserId: user.id,
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

describe('requestPasswordReset', () => {
    // The audit is written by this service function, not the `postResetRequest` controller.
    // This pins that the "audit fires either way" contract holds there, since an
    // account-enumeration defense that only audits a REAL address would leak the same fact the
    // identical HTTP response is built to hide. See `docs/theory/module-lifecycle.md` rule 1.
    it('audits the attempt unconditionally, even for an address with no account', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);

        const sent = await accountService.requestPasswordReset(
            'nobody@example.com',
            testCallerContext
        );

        expect(sent).toBe(false);
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_PASSWORD_RESET_REQUESTED,
                actorUserId: 'anonymous',
                actorRole: 'anonymous',
                outcome: 'success'
            })
        );
    });

    it('queues a reset mail and audits the same way for a registered address', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser();

        const sent = await accountService.requestPasswordReset(user.email, testCallerContext);

        expect(sent).toBe(true);
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_PASSWORD_RESET_REQUESTED,
                actorUserId: 'anonymous',
                actorRole: 'anonymous',
                outcome: 'success'
            })
        );
    });
});

/**
 * Moves the live reset token's send time into the past, so the 60 s pacing has run out. Ageing the
 * recorded send, rather than a fake clock: `sentAt` is what the pacing reads.
 */
const ageResetSend = (userId: string): Promise<void> =>
    ageTokenSend(userId, PASSWORD_RESET_TOKEN_TYPE, (RESET_REQUEST_SECONDS + 1) * 1000);

/** The `password` tokens the account holds, by digest. */
const resetDigests = (userId: string) =>
    readTokens(userId).then((tokens) =>
        tokens
            .filter((token) => token.type === PASSWORD_RESET_TOKEN_TYPE)
            .map(({ tokenHash }) => tokenHash)
    );

describe('one live reset link per account', () => {
    // Every request used to push another working link (5 a minute per address, ~300 an hour),
    // each valid for its whole TTL.
    it('replaces the previous link when another is requested, so only the newest works', async () => {
        const user = await createUser();

        await accountService.requestPasswordReset(user.email, testCallerContext);
        const first = await resetDigests(user.id);
        await ageResetSend(user.id);
        await accountService.requestPasswordReset(user.email, testCallerContext);
        const second = await resetDigests(user.id);

        expect(first).toHaveLength(1);
        expect(second).toHaveLength(1);
        expect(second).not.toEqual(first);
    });

    it('leaves every other kind of token alone', async () => {
        const user = await createUser();
        await plantSession(user.id, 'keep-this-session', { ttlMs: 60_000 });

        await accountService.requestPasswordReset(user.email, testCallerContext);
        await ageResetSend(user.id);
        await accountService.requestPasswordReset(user.email, testCallerContext);

        const sessions = await sessionRowsOf(user.id);
        expect(sessions.map(({ tokenHash }) => tokenHash)).toEqual([
            hashToken('keep-this-session')
        ]);
    });

    it('holds the setup link to the same rule', async () => {
        const user = await createUser();
        await plantToken(user.id, PASSWORD_RESET_TOKEN_TYPE, 'older-link', { ttlMs: 60_000 });

        await accountService.requestAccountSetup(user);

        const digests = await resetDigests(user.id);
        expect(digests).toHaveLength(1);
        expect(digests).not.toContain(hashToken('older-link'));
    });
});

describe('the reset request is paced per account, silently', () => {
    // A 429 would tell a stranger which addresses have an account — the one thing the uniform 200
    // exists to hide — so a request inside the window is skipped: same answer, nothing sent.
    it('mails nothing and mints nothing for a second request inside the window', async () => {
        const user = await createUser();
        const first = await accountService.requestPasswordReset(user.email, testCallerContext);
        const before = await resetDigests(user.id);

        const second = await accountService.requestPasswordReset(user.email, testCallerContext);

        expect(first).toBe(true);
        expect(second).toBe(false);
        // The link already mailed is still the live one.
        expect(await resetDigests(user.id)).toEqual(before);
    });

    it('still records the attempt in the audit trail, as it does for an unknown address', async () => {
        const user = await createUser();
        await accountService.requestPasswordReset(user.email, testCallerContext);
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await accountService.requestPasswordReset(user.email, testCallerContext);

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({ action: accountAuditActions.AUTH_PASSWORD_RESET_REQUESTED })
        );
    });

    it('mails again once the window has passed', async () => {
        const user = await createUser();
        await accountService.requestPasswordReset(user.email, testCallerContext);
        await ageResetSend(user.id);

        await expect(
            accountService.requestPasswordReset(user.email, testCallerContext)
        ).resolves.toBe(true);
    });

    it('paces one account without touching another', async () => {
        const first = await createUser({ email: 'pace-one@example.com' });
        const second = await createUser({ email: 'pace-two@example.com' });
        await accountService.requestPasswordReset(first.email, testCallerContext);

        await expect(
            accountService.requestPasswordReset(second.email, testCallerContext)
        ).resolves.toBe(true);
    });
});

describe('an email change is paced per account', () => {
    it('answers 429 EMAIL_CHANGE_TOO_SOON with the countdown, and saves nothing', async () => {
        const user = await createUser({ email: 'pace-change@example.com', verifiedAt: new Date() });
        await updateProfile(user.id, { email: 'first-new@example.com' }, testCallerContext);

        const refused = asReject(
            await updateProfile(user.id, { email: 'second-new@example.com' }, testCallerContext)
        );

        expect(refused.status).toBe(429);
        expect(refused.errors[0]).toMatchObject({
            code: 'EMAIL_CHANGE_TOO_SOON',
            details: { retryAfter: expect.any(Number) as number }
        });
        const stored = await userRepository.findByIdWithCredentials(user.id);
        expect(stored?.pendingEmail).toBe('first-new@example.com');
    });

    it('allows another change once the window has passed', async () => {
        const user = await createUser({ email: 'pace-later@example.com', verifiedAt: new Date() });
        await updateProfile(user.id, { email: 'one-new@example.com' }, testCallerContext);
        await ageEmailChangeSend(user.id);

        const result = await updateProfile(
            user.id,
            { email: 'two-new@example.com' },
            testCallerContext
        );

        expect(result.success).toBe(true);
    });

    it('does not pace a save that changes no email', async () => {
        const user = await createUser({ email: 'pace-name@example.com', verifiedAt: new Date() });
        await updateProfile(user.id, { email: 'pending-new@example.com' }, testCallerContext);

        const result = await updateProfile(user.id, { username: 'renamed' }, testCallerContext);

        expect(result.success).toBe(true);
    });
});

/** Plants a live reset link for `user` and spends it for the replacement password. */
const resetWithLink = async (user: { id: string }) => {
    await plantToken(user.id, 'password', 'post-reset-link');
    return accountService.completePasswordReset(
        'post-reset-link',
        REPLACEMENT_PASSWORD,
        REPLACEMENT_PASSWORD,
        testCallerContext
    );
};

describe('what a completed reset leaves behind', () => {
    it('changes the password and audits a reset completion, distinct from a logged-in change', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ password: PASSPHRASE_PASSWORD });

        asSuccess(await resetWithLink(user));

        const withNew = await accountService.login(user.email, REPLACEMENT_PASSWORD);
        expect(withNew.success).toBe(true);
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_PASSWORD_RESET_COMPLETED,
                outcome: 'success'
            })
        );
    });

    /*
     * The reset token reached the account's mailbox and nowhere else, so spending it proves
     * possession as strongly as a `verify` token does. Without this, the visitor whose
     * verification mail never arrived resets from that same inbox and is still held at
     * `unverified` — unable to check out, with a re-send of the failed mail as their only remedy.
     */
    it('proves the address, promoting an unverified account to customer', async () => {
        const user = await createUser({ password: PASSPHRASE_PASSWORD }, 'unverified');

        asSuccess(await resetWithLink(user));

        const roles = await rolesOf(user.id, DEPLOYMENT_TENANT_ID);
        expect(roles.tenant).toBe('customer');
        const reloaded = await userRepository.findById(user.id);
        expect(reloaded?.verifiedAt).toBeInstanceOf(Date);
    });

    /*
     * The audit-role lookup after a completed reset caught its own rejection with no
     * logging at all — a swallowed failure had no trail. The reset itself must still succeed:
     * the password already changed, and a missing audit row is the worst case, not a reason to
     * fail the response.
     */
    it('still succeeds, logged, when the post-reset role lookup fails', async () => {
        const user = await createUser({ password: PASSPHRASE_PASSWORD });
        const loggedWarn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
        // The mock factory above wraps `rolesOf` in a plain `jest.fn`, so this is genuinely a
        // mock function, not the real export the compiler otherwise sees.
        const mockedRolesOf = accessPort.rolesOf as jest.MockedFunction<typeof accessPort.rolesOf>;
        mockedRolesOf.mockRejectedValueOnce(new Error('lookup unavailable'));

        const result = asSuccess(await resetWithLink(user));

        expect(result.data?.email).toBe(user.email);
        const withNew = await accountService.login(user.email, REPLACEMENT_PASSWORD);
        expect(withNew.success).toBe(true);
        // Fire-and-forget: give the rejected lookup's own microtask a turn before asserting.
        await Promise.resolve();
        expect(loggedWarn).toHaveBeenCalledWith(expect.objectContaining({ userId: user.id }));
        jest.restoreAllMocks();
    });
});

describe('requestAccountDeletion', () => {
    it('issues a delete token and audits the request', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser();

        await accountService.requestAccountDeletion(user, testCallerContext);

        /*
         * The token value is deliberately NOT returned — it goes straight into the mail
         * this function publishes, so a caller cannot hold a live delete credential. What is
         * observable is that exactly one was stored.
         */
        const tokens = await readTokens(user.id);
        expect(tokens.filter(({ type }) => type === 'delete')).toHaveLength(1);
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_ACCOUNT_DELETE_REQUESTED,
                actorUserId: user.id,
                outcome: 'success'
            })
        );
    });
});

/**
 * What makes a one-time token LIVE, asserted where the rule now lives.
 *
 * `findLiveToken` is the single statement of the rule — no controller carries a copy — so this is
 * the only place it can be proven. The cases below are exactly the four a caller must not be able
 * to tell apart; see the note on refusals in `services/tokens.ts`.
 */
describe('findLiveToken', () => {
    it('finds the holder of a live token of the right type', async () => {
        const user = await createUser();
        await plantToken(user.id, 'password', 'live-reset', { ttlMs: 3_600_000 });

        const found = await accountService.findLiveToken('password', 'live-reset');

        expect(found?.id).toBe(user.id);
    });

    it('refuses a token of another type, so one link cannot be spent as another', async () => {
        const user = await createUser();
        await plantToken(user.id, 'delete', 'delete-token', { ttlMs: 3_600_000 });

        await expect(
            accountService.findLiveToken('password', 'delete-token')
        ).resolves.toBeUndefined();
    });

    it('refuses an expired token', async () => {
        /*
         * Planted already expired: `issueToken` cannot produce this state, and it is the one a
         * link reaches by sitting in an inbox overnight while the database's TTL monitor (which
         * runs about once a minute) has yet to delete the row. Reads check the expiry themselves.
         */
        const user = await createUser();
        await plantToken(user.id, 'password', 'stale-reset', { ttlMs: -1000 });

        await expect(
            accountService.findLiveToken('password', 'stale-reset')
        ).resolves.toBeUndefined();
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
        await plantToken(user.id, 'password', 'one-shot', { ttlMs: 3_600_000 });

        await expect(accountService.spendLiveToken('password', 'one-shot')).resolves.toBe(true);
        await expect(accountService.spendLiveToken('password', 'one-shot')).resolves.toBe(false);
    });

    it('leaves a spent token unfindable', async () => {
        const user = await createUser();
        await plantToken(user.id, 'password', 'burn-me', { ttlMs: 3_600_000 });
        await accountService.spendLiveToken('password', 'burn-me');

        await expect(accountService.findLiveToken('password', 'burn-me')).resolves.toBeUndefined();
    });
});

/**
 * A refused password must never burn the link it arrived with: the breach check needs the found
 * user, so it sits between the find and the atomic spend (`services/password-reset.ts`).
 */
describe('completePasswordReset', () => {
    /** On the bundled breach list and strong enough to clear the composition rules. */
    const BREACHED = 'Password1!';
    const GOOD = 'Fresh_Secret_9!x';

    it('refuses a breached password, and the SAME link still works with a good one', async () => {
        const user = await createUser();
        await plantToken(user.id, 'password', 'reset-link', { ttlMs: 3_600_000 });

        const refused = asReject(
            await accountService.completePasswordReset(
                'reset-link',
                BREACHED,
                BREACHED,
                testCallerContext
            )
        );
        const accepted = await accountService.completePasswordReset(
            'reset-link',
            GOOD,
            GOOD,
            testCallerContext
        );

        expect(refused.status).toBe(422);
        expect(asSuccess(accepted).status).toBe(200);
    });

    it('refuses a mistyped pair without touching the link', async () => {
        const user = await createUser();
        await plantToken(user.id, 'password', 'typo-link', { ttlMs: 3_600_000 });

        const refused = asReject(
            await accountService.completePasswordReset(
                'typo-link',
                GOOD,
                `${GOOD}x`,
                testCallerContext
            )
        );

        expect(refused.status).toBe(422);
        await expect(accountService.findLiveToken('password', 'typo-link')).resolves.toBeDefined();
    });

    it('spends the link: a second use of it is refused like a link that never existed', async () => {
        const user = await createUser();
        await plantToken(user.id, 'password', 'once-link', { ttlMs: 3_600_000 });
        await accountService.completePasswordReset('once-link', GOOD, GOOD, testCallerContext);

        const second = asReject(
            await accountService.completePasswordReset('once-link', GOOD, GOOD, testCallerContext)
        );
        const invented = asReject(
            await accountService.completePasswordReset(
                'never-issued',
                GOOD,
                GOOD,
                testCallerContext
            )
        );

        expect(second.status).toBe(422);
        expect(second.errors).toEqual(invented.errors);
    });

    it('lets exactly one of two simultaneous uses win', async () => {
        const user = await createUser();
        await plantToken(user.id, 'password', 'race-link', { ttlMs: 3_600_000 });

        const results = await Promise.all([
            accountService.completePasswordReset('race-link', GOOD, GOOD, testCallerContext),
            accountService.completePasswordReset('race-link', GOOD, GOOD, testCallerContext)
        ]);

        expect(results.filter((result) => result.success)).toHaveLength(1);
    });
});
