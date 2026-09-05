/**
 * @module
 * `loginOrCreateFromOAuth`'s three branches (`services/oauth.ts`) — the find-or-create/link logic
 * behind every OAuth callback. Touches the real database (an identity lookup, a linking `$push`, a
 * user creation), so it lives here rather than in `tests/unit` alongside the pure provider logic.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/caller-context';
import { createUser } from '@modules/users/tests/fixtures';
import { userRepository } from '@modules/users';
import * as auditPort from '@infrastructure/observability/audit';
import * as analyticsPort from '@infrastructure/observability/analytics';
import { observePort } from '@tests/ports';
import { loginOrCreateFromOAuth, OAuthEmailUnverifiedError } from '../../services/oauth';
import { accountAuditActions } from '../../audit';
import { accountAnalyticsEvents } from '../../analytics';
import type { OAuthIdentity } from '../../oauth/providers/port';

/* Replaced, not spied on — see `tests/support/ports.ts` for why. */
jest.mock('@infrastructure/observability/audit', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/audit'),
    emitAuditEvent: jest.fn()
}));
jest.mock('@infrastructure/observability/analytics', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/analytics'),
    emitAnalyticsEvent: jest.fn()
}));

setupTestDb();
afterEach(() => jest.restoreAllMocks());

const identity = (overrides: Partial<OAuthIdentity> = {}): OAuthIdentity => ({
    providerId: 'subject-1',
    email: 'oauth-user@example.com',
    emailVerified: true,
    name: 'OAuth User',
    ...overrides
});

/** Re-select `oauthAccounts` — `select: false` on the schema, so a plain read never carries it. */
const oauthAccountsOf = async (userId: string) => {
    const document_ = await userRepository.findByIdWithCredentials(userId);
    return document_?.oauthAccounts ?? [];
};

describe('loginOrCreateFromOAuth — case 1: an already-linked identity', () => {
    it('logs the existing account in without creating anything new', async () => {
        const user = await createUser({ email: 'existing@example.com' });
        await userRepository.linkOAuthAccount(user.id, {
            provider: 'google',
            providerId: 'subject-1',
            connectedAt: new Date()
        });
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);

        const resolved = await loginOrCreateFromOAuth('google', identity(), testCallerContext);

        expect(resolved.id).toBe(user.id);
        expect(await userRepository.count({})).toBe(1);
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_LOGIN,
                actor_user_id: user.id
            })
        );
        expect(analyticsSpy).toHaveBeenCalledWith(
            expect.objectContaining({ event: accountAnalyticsEvents.USER_LOGGED_IN })
        );
    });
});

describe('loginOrCreateFromOAuth — case 2: a verified email matching an existing account', () => {
    it('links the new identity onto the account and marks it verified', async () => {
        const user = await createUser({ email: identity().email, verified: false });
        const auditSpy = observePort(auditPort.emitAuditEvent);

        const resolved = await loginOrCreateFromOAuth('google', identity(), testCallerContext);

        expect(resolved.id).toBe(user.id);
        expect(await userRepository.count({})).toBe(1);
        const linked = await oauthAccountsOf(user.id);
        expect(linked).toHaveLength(1);
        expect(linked[0]).toMatchObject({ provider: 'google', providerId: 'subject-1' });
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_OAUTH_LINKED,
                actor_user_id: user.id
            })
        );
        const refreshed = await userRepository.findById(user.id);
        expect(refreshed?.verified).toBe(true);
    });

    it('refuses to link when the provider does not vouch for the email, and changes nothing', async () => {
        const user = await createUser({ email: identity().email });
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await expect(
            loginOrCreateFromOAuth('google', identity({ emailVerified: false }), testCallerContext)
        ).rejects.toBeInstanceOf(OAuthEmailUnverifiedError);

        expect(await oauthAccountsOf(user.id)).toEqual([]);
        expect(auditSpy).not.toHaveBeenCalled();
    });
});

describe('loginOrCreateFromOAuth — case 3: a never-seen identity and email', () => {
    it('creates a password-less, pre-verified account', async () => {
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);

        const created = await loginOrCreateFromOAuth('google', identity(), testCallerContext);

        expect(created.email).toBe(identity().email);
        expect(created.verified).toBe(true);
        expect(created.active).toBe(true);
        const stored = await userRepository.findByIdWithCredentials(created.id);
        expect(stored?.password).toBeUndefined();
        expect(stored?.oauthAccounts).toEqual([
            expect.objectContaining({ provider: 'google', providerId: 'subject-1' })
        ]);
        expect(analyticsSpy).toHaveBeenCalledWith(
            expect.objectContaining({ event: accountAnalyticsEvents.USER_SIGNED_UP })
        );
    });

    it('lets the SAME identity sign up with either provider independently', async () => {
        const google = await loginOrCreateFromOAuth('google', identity(), testCallerContext);
        const github = await loginOrCreateFromOAuth(
            'github',
            identity({ providerId: 'subject-1', email: 'other@example.com' }),
            testCallerContext
        );

        // Two different accounts: `users_oauth_identity` scopes uniqueness to (provider,
        // providerId) together, not `providerId` alone — different providers can coincidentally
        // reuse the same subject shape without colliding.
        expect(google.id).not.toBe(github.id);
    });
});
