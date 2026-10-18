/**
 * @module
 * `loginOrCreateFromOAuth`'s branches and the signed-in connect (`services/oauth.ts`) — the
 * find-or-create logic behind every OAuth callback, and the only door that links a provider. Touches the real database (an identity lookup, a linking `$push`, a
 * user creation), so it lives here rather than in `tests/unit` alongside the pure provider logic.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { userRepository } from '@modules/users/tests/factories';
import * as auditPort from '@infrastructure/observability/audit';
import * as analyticsPort from '@infrastructure/observability/analytics';
import { observePort } from '@tests/ports';
import { rehostRemoteImage } from '@infrastructure/adapters/remote-image';
import {
    linkProviderToSignedInAccount,
    loginOrCreateFromOAuth,
    presentClaim,
    startOAuthLink,
    unlinkOAuthProvider,
    OAuthAccountExistsError,
    OAuthEmailUnverifiedError,
    OAuthAccountUnverifiedError,
    OAuthAccountUnavailableError,
    OAuthIdentityTakenError,
    OAuthLinkExpiredError
} from '../../services/oauth';
import { accountAuditActions } from '../../audit';
import { accountAnalyticsEvents } from '../../analytics';
import type { OAuthIdentity } from '../../oauth/providers/port';

/* Replaced, not spied on — see `tests/support/ports.ts` for why. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);
jest.mock('@infrastructure/observability/analytics', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/analytics'),
    emitAnalyticsEvent: jest.fn()
}));

/* The download is the network half; what signup does with its answer is what these tests cover. */
jest.mock('@infrastructure/adapters/remote-image', () => ({
    rehostRemoteImage: jest.fn().mockResolvedValue(undefined)
}));

/** Every queued mail, newest last. */
const mockOutbox: { to?: string; template: string; data: Record<string, unknown> }[] = [];

jest.mock('@infrastructure/adapters/mailer', () => ({
    ...jest.requireActual<typeof import('@infrastructure/adapters/mailer')>(
        '@infrastructure/adapters/mailer'
    ),
    enqueueEmail: jest.fn(
        (envelope: { to?: string }, template: string, data: Record<string, unknown>) => {
            mockOutbox.push({ to: envelope.to, template, data });
            return Promise.resolve();
        }
    )
}));

setupTestDb();
beforeEach(() => {
    mockOutbox.length = 0;
});
afterEach(() => jest.clearAllMocks());

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
     * Recording a login is only a fact once a session actually exists, which is a CONTROLLER
     * decision (`get-oauth-callback.ts` calls `recordLoginSuccess`, reading the account's real
     * role). An audit or metric emitted here would hardcode `actorRole: 'user'` — wrong for an
     * admin — and skip `authLoginTotal`. So this branch resolves the account, tags the outcome,
     * and emits nothing at all.
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
    /*
     * NIST SP 800-63C-4 §3.8.1: linking needs an authenticated session with the account. A sign-in
     * whose email merely matches is refused, however many proofs of the address both sides hold, and
     * leaves the account exactly as it was (the owner connects the provider from their profile).
     */
    it('links nothing and audits nothing: the owner connects from a signed-in session', async () => {
        const user = await createUser({ email: identity().email, verifiedAt: new Date() }, 'admin');
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await expect(
            loginOrCreateFromOAuth('google', identity(), testCallerContext)
        ).rejects.toBeInstanceOf(OAuthAccountExistsError);

        expect(await oauthAccountsOf(user.id)).toEqual([]);
        expect(await userRepository.count({})).toBe(1);
        expect(auditSpy).not.toHaveBeenCalled();
    });

    it('leaves a 2FA account unlinked too: no link is saved before the challenge', async () => {
        const user = await createUser({
            email: identity().email,
            verifiedAt: new Date(),
            twoFactorEnabledAt: new Date().toISOString()
        });

        await expect(
            loginOrCreateFromOAuth('google', identity(), testCallerContext)
        ).rejects.toBeInstanceOf(OAuthAccountExistsError);

        expect(await oauthAccountsOf(user.id)).toEqual([]);
    });

    it('refuses when the provider does not vouch for the email, and changes nothing', async () => {
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
     * cannot prove it; the victim arrives through the provider. The refusal names the remedy (the
     * reset proves the same mailbox) instead of `account_exists`.
     */
    it('refuses an account that never proved the address itself, with its own error', async () => {
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

/** An account that started a connect attempt, and the token its callback redeems. */
const connecting = async (overrides: Record<string, unknown> = {}) => {
    const user = await createUser({
        email: 'owner@example.com',
        verifiedAt: new Date(),
        ...overrides
    });
    return { user, token: await startOAuthLink(user.id) };
};

describe('connecting a provider from a signed-in session', () => {
    it('links the identity to the account that started it, whatever email the provider holds', async () => {
        const { user, token } = await connecting();
        const auditSpy = observePort(auditPort.emitAuditEvent);

        const linked = await linkProviderToSignedInAccount(
            token,
            'google',
            identity({ email: 'a-different-address@example.com' }),
            testCallerContext
        );

        expect(linked.id).toBe(user.id);
        expect(await oauthAccountsOf(user.id)).toEqual([
            expect.objectContaining({ provider: 'google', providerId: 'subject-1' })
        ]);
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_OAUTH_LINKED,
                actorUserId: user.id
            })
        );
    });

    it('mails the owner that a sign-in method was added, naming the provider and no link', async () => {
        const { user, token } = await connecting();

        await linkProviderToSignedInAccount(token, 'github', identity(), testCallerContext);

        const mails = mockOutbox.filter(
            ({ template }) => template === 'account.sign-in-method-changed'
        );
        const mail = mails[0];
        expect(mails).toHaveLength(1);
        expect(mail?.to).toBe(user.email);
        expect(JSON.stringify(mail?.data)).toContain('github');
        expect(JSON.stringify(mail?.data)).not.toMatch(/https?:\/\//);
    });

    it('spends the token: a replayed callback is an expired attempt, linking nothing twice', async () => {
        const { user, token } = await connecting();
        await linkProviderToSignedInAccount(token, 'google', identity(), testCallerContext);

        await expect(
            linkProviderToSignedInAccount(
                token,
                'github',
                identity({ providerId: 'subject-2' }),
                testCallerContext
            )
        ).rejects.toBeInstanceOf(OAuthLinkExpiredError);

        expect(await oauthAccountsOf(user.id)).toHaveLength(1);
    });

    it('refuses a missing or unknown token as an expired attempt', async () => {
        await expect(
            linkProviderToSignedInAccount(undefined, 'google', identity(), testCallerContext)
        ).rejects.toBeInstanceOf(OAuthLinkExpiredError);
        await expect(
            linkProviderToSignedInAccount('nope', 'google', identity(), testCallerContext)
        ).rejects.toBeInstanceOf(OAuthLinkExpiredError);
    });

    it('refuses an identity another account already holds, and links nothing', async () => {
        const owner = await createUser({ email: 'holder@example.com', verifiedAt: new Date() });
        await userRepository.linkOAuthAccount(owner.id, {
            provider: 'google',
            providerId: 'subject-1',
            connectedAt: new Date()
        });
        const { user, token } = await connecting();

        await expect(
            linkProviderToSignedInAccount(token, 'google', identity(), testCallerContext)
        ).rejects.toBeInstanceOf(OAuthIdentityTakenError);

        expect(await oauthAccountsOf(user.id)).toEqual([]);
        expect(await oauthAccountsOf(owner.id)).toHaveLength(1);
    });

    it('does not audit or mail again when the account already holds this provider', async () => {
        const { user, token } = await connecting();
        await userRepository.linkOAuthAccount(user.id, {
            provider: 'google',
            providerId: 'older-subject',
            connectedAt: new Date()
        });
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await linkProviderToSignedInAccount(token, 'google', identity(), testCallerContext);

        expect(await oauthAccountsOf(user.id)).toHaveLength(1);
        expect(auditSpy).not.toHaveBeenCalled();
        expect(mockOutbox).toEqual([]);
    });

    it('refuses an account that was banned while the attempt was out', async () => {
        const { user, token } = await connecting();
        await userRepository.updateMany({ _id: user.id }, { active: false });

        await expect(
            linkProviderToSignedInAccount(token, 'google', identity(), testCallerContext)
        ).rejects.toBeInstanceOf(OAuthAccountUnavailableError);

        expect(await oauthAccountsOf(user.id)).toEqual([]);
    });

    it('mails the owner when a provider is removed', async () => {
        const user = await createUser({ email: 'owner@example.com', verifiedAt: new Date() });
        await userRepository.linkOAuthAccount(user.id, {
            provider: 'google',
            providerId: 'subject-1',
            connectedAt: new Date()
        });

        const removed = await unlinkOAuthProvider(user.id, 'google', testCallerContext);

        expect(removed).toBe(true);
        const mail = mockOutbox.find(
            ({ template }) => template === 'account.sign-in-method-changed'
        );
        expect(mail?.to).toBe(user.email);
        expect(JSON.stringify(mail?.data)).toContain('google');
    });

    it('mails nobody for a provider that was never linked', async () => {
        const user = await createUser({ email: 'owner@example.com', verifiedAt: new Date() });

        expect(await unlinkOAuthProvider(user.id, 'google', testCallerContext)).toBe(false);
        expect(mockOutbox).toEqual([]);
    });

    it('does not mail an account made through a provider: nothing was added to an account', async () => {
        await loginOrCreateFromOAuth('google', identity(), testCallerContext);

        expect(mockOutbox).toEqual([]);
    });
});

describe('loginOrCreateFromOAuth — an account that may not authenticate', () => {
    const states = [
        ['banned', { active: false }],
        ['soft-deleted', { deletedAt: new Date() }]
    ] as const;

    it.each(states)(
        'a %s account with a matching verified email gets no link, no audit row and no signup',
        async (_state, overrides) => {
            const user = await createUser({
                email: identity().email,
                verifiedAt: new Date(),
                ...overrides
            });
            const auditSpy = observePort(auditPort.emitAuditEvent);

            await expect(
                loginOrCreateFromOAuth('google', identity(), testCallerContext)
            ).rejects.toBeInstanceOf(OAuthAccountUnavailableError);

            expect(await oauthAccountsOf(user.id)).toEqual([]);
            expect(await userRepository.count({})).toBe(1);
            expect(auditSpy).not.toHaveBeenCalled();
        }
    );

    it.each(states)(
        'a %s account that linked the provider earlier is refused without a second entry',
        async (_state, overrides) => {
            const user = await createUser({
                email: identity().email,
                verifiedAt: new Date(),
                ...overrides
            });
            await userRepository.linkOAuthAccount(user.id, {
                provider: 'google',
                providerId: 'subject-1',
                connectedAt: new Date()
            });

            await expect(
                loginOrCreateFromOAuth('google', identity(), testCallerContext)
            ).rejects.toBeInstanceOf(OAuthAccountUnavailableError);

            expect(await oauthAccountsOf(user.id)).toHaveLength(1);
        }
    );
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

    it('refuses an unverified email and creates no user', async () => {
        await expect(
            loginOrCreateFromOAuth('google', identity({ emailVerified: false }), testCallerContext)
        ).rejects.toBeInstanceOf(OAuthEmailUnverifiedError);

        expect(await userRepository.count({})).toBe(0);
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

describe('loginOrCreateFromOAuth — the provider avatar and name at signup', () => {
    it('treats a blank name and a blank avatar as absent', async () => {
        const resolved = await loginOrCreateFromOAuth(
            'google',
            identity({ name: '   ', imageUrl: '' }),
            testCallerContext
        );

        expect(resolved.user.username).toBe(identity().email);
        expect(rehostRemoteImage).toHaveBeenCalledWith(undefined);
        const stored = await userRepository.findById(resolved.user.id);
        expect(stored?.imageUrl).toBeUndefined();
    });

    it('stores the re-hosted copy and never the provider url', async () => {
        jest.mocked(rehostRemoteImage).mockResolvedValueOnce({
            imageUrl: '/images/local-avatar.png',
            thumbnailUrl: '/images/thumbs/v1/local-avatar.webp'
        });

        const resolved = await loginOrCreateFromOAuth(
            'github',
            identity({ imageUrl: 'https://avatars.example.test/u/1' }),
            testCallerContext
        );

        expect(rehostRemoteImage).toHaveBeenCalledWith('https://avatars.example.test/u/1');
        const stored = await userRepository.findById(resolved.user.id);
        expect(stored?.imageUrl).toBe('/images/local-avatar.png');
        expect(stored?.thumbnailUrl).toBe('/images/thumbs/v1/local-avatar.webp');
    });

    it('signs up with no image when the download fails', async () => {
        const resolved = await loginOrCreateFromOAuth(
            'github',
            identity({ imageUrl: 'https://avatars.example.test/u/2' }),
            testCallerContext
        );

        expect(resolved.outcome).toBe('signup');
        const stored = await userRepository.findById(resolved.user.id);
        expect(stored?.imageUrl).toBeUndefined();
    });
});

describe('presentClaim', () => {
    it.each([
        [undefined, undefined],
        ['', undefined],
        ['  \t ', undefined],
        ['  Ada  ', 'Ada']
    ])('reads %j as %j', (raw, expected) => {
        expect(presentClaim(raw)).toBe(expected);
    });
});
