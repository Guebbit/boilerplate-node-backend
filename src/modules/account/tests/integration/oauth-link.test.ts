/**
 * @module
 * `loginOrCreateFromOAuth`'s three branches (`services/oauth.ts`) — the find-or-create/link logic
 * behind every OAuth callback. Touches the real database (an identity lookup, a linking `$push`, a
 * user creation), so it lives here rather than in `tests/unit` alongside the pure provider logic.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { userRepository } from '@modules/users/tests/factories';
import * as auditPort from '@infrastructure/observability/audit';
import * as analyticsPort from '@infrastructure/observability/analytics';
import { observePort } from '@tests/ports';
import {
    loginOrCreateFromOAuth,
    OAuthEmailUnverifiedError,
    OAuthAccountUnverifiedError
} from '../../services/oauth';
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

/** A provider identity, verified by default — the shape `exchangeCode` hands the service. */
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
    /*
     * B4: this branch used to audit + analytics-emit the login itself, hardcoding
     * `actor_role: 'user'` and never touching `authLoginTotal` — wrong for an admin, and
     * invisible to the metric every other login method reports through. Recording a login is
     * only a fact once a session actually exists, which is a CONTROLLER decision
     * (`get-oauth-callback.ts` calls `recordLoginSuccess`, reading the account's real role) —
     * so this branch resolves the account and tags the outcome, and emits nothing at all.
     */
    it('resolves the existing account, tagged as a login, without creating anything new', async () => {
        const user = await createUser({ email: 'existing@example.com' });
        await userRepository.linkOAuthAccount(user.id, {
            provider: 'google',
            providerId: 'subject-1',
            connectedAt: new Date()
        });
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);

        const resolved = await loginOrCreateFromOAuth('google', identity(), testCallerContext);

        expect(resolved.outcome).toBe('login');
        expect(resolved.user.id).toBe(user.id);
        expect(await userRepository.count({})).toBe(1);
        expect(auditSpy).not.toHaveBeenCalled();
        expect(analyticsSpy).not.toHaveBeenCalled();
    });
});

describe('loginOrCreateFromOAuth — case 2: a verified email matching an existing account', () => {
    it('links the new identity onto the account, audited with its real role', async () => {
        const user = await createUser({ email: identity().email, verifiedAt: new Date() }, 'admin');
        const auditSpy = observePort(auditPort.emitAuditEvent);

        const resolved = await loginOrCreateFromOAuth('google', identity(), testCallerContext);

        expect(resolved.outcome).toBe('link');
        expect(resolved.user.id).toBe(user.id);
        expect(await userRepository.count({})).toBe(1);
        const linked = await oauthAccountsOf(user.id);
        expect(linked).toHaveLength(1);
        expect(linked[0]).toMatchObject({ provider: 'google', providerId: 'subject-1' });
        // B4: this hardcoded `actor_role: 'user'` — wrong for an account that already holds
        // 'admin', the exact shape a first-ever OAuth link on an existing admin account takes.
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_OAUTH_LINKED,
                actor_user_id: user.id,
                actor_role: 'admin'
            })
        );
    });

    it('still audits the link, but not as a completed login, when 2FA is armed', async () => {
        const user = await createUser({
            email: identity().email,
            verifiedAt: new Date(),
            twoFactorEnabledAt: new Date().toISOString()
        });
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);

        const resolved = await loginOrCreateFromOAuth('google', identity(), testCallerContext);

        expect(resolved.user.id).toBe(user.id);
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({ action: accountAuditActions.AUTH_OAUTH_LINKED })
        );
        expect(analyticsSpy).not.toHaveBeenCalled();
    });

    it('refuses to link when the provider does not vouch for the email, and changes nothing', async () => {
        const user = await createUser({ email: identity().email, verifiedAt: new Date() });
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await expect(
            loginOrCreateFromOAuth('google', identity({ emailVerified: false }), testCallerContext)
        ).rejects.toBeInstanceOf(OAuthEmailUnverifiedError);

        expect(await oauthAccountsOf(user.id)).toEqual([]);
        expect(auditSpy).not.toHaveBeenCalled();
    });

    /*
     * Pre-account-takeover. The attacker holds `victim@example.com` with their own password and
     * cannot prove it; the victim arrives through the provider. Linking here would hand them an
     * account the attacker still has the password to — so BOTH sides must have proved the
     * address, and the victim's way in is the reset, which proves the same mailbox.
     */
    it('refuses to link onto an account that never proved the address itself', async () => {
        const user = await createUser({ email: identity().email });
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await expect(
            loginOrCreateFromOAuth('google', identity(), testCallerContext)
        ).rejects.toBeInstanceOf(OAuthAccountUnverifiedError);

        expect(await oauthAccountsOf(user.id)).toEqual([]);
        // Not promoted on the way out either: the refusal must leave the squatted account exactly
        // as unproven as it was.
        const refreshed = await userRepository.findById(user.id);
        expect(refreshed?.verifiedAt ?? null).toBeNull();
        expect(auditSpy).not.toHaveBeenCalled();
    });
});

describe('loginOrCreateFromOAuth — case 3: a never-seen identity and email', () => {
    it('creates a password-less, pre-verified account', async () => {
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);

        const resolved = await loginOrCreateFromOAuth('google', identity(), testCallerContext);

        expect(resolved.outcome).toBe('signup');
        expect(resolved.user.email).toBe(identity().email);
        expect(resolved.user.verifiedAt).toBeInstanceOf(Date);
        expect(resolved.user.active).toBe(true);
        const stored = await userRepository.findByIdWithCredentials(resolved.user.id);
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
        expect(google.user.id).not.toBe(github.user.id);
    });
});
