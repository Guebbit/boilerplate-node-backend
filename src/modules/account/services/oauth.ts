/**
 * @module
 * OAuth login/signup — the OAuth counterpart to `./authentication.ts`'s `login`/`signup`, one
 * layer above `../oauth/`'s provider mechanics (which know nothing about `UserDocument` or
 * audit/analytics — see that folder's own files). Three outcomes only: an already-linked identity
 * logs in, a verified email links a NEW identity onto an existing password account, and anything
 * else signs up a fresh, password-less user.
 */

import { getCurrentLocale } from '@infrastructure/i18n';
import { userRepository, type UserDocument } from '@modules/users';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAnalyticsEvents } from '../analytics';
import { accountAuditActions } from '../audit';
import type { OAuthIdentity } from '../oauth/providers/port';

/**
 * The provider vouches for this identity, but its email matches an EXISTING account whose own
 * email the provider does not claim as verified — refusing the link here is what stops anyone who
 * can register an OAuth app under a victim's address from taking over that account. The callback
 * controller turns this into a `?error=email_unverified` redirect, never a generic failure.
 */
export class OAuthEmailUnverifiedError extends Error {
    constructor(email: string) {
        super(`OAuth email not verified for account linking: ${email}`);
        this.name = 'OAuthEmailUnverifiedError';
    }
}

/** Audit + analytics for an existing identity that just logged in — the case-1 tail. */
const recordLogin = (
    user: UserDocument,
    provider: string,
    context: CallerContext
): UserDocument => {
    emitAuditEvent(
        buildAuditEvent(context, {
            action: accountAuditActions.AUTH_LOGIN,
            actor_user_id: user.id,
            actor_role: 'user',
            outcome: 'success',
            metadata: { via: provider }
        })
    );
    emitAnalyticsEvent({
        ...buildAnalyticsBase(context),
        distinctId: user.id,
        event: accountAnalyticsEvents.USER_LOGGED_IN
    });
    return user;
};

/** Link a NEW provider identity onto an existing, verified-match account — the case-2 tail. */
const linkToExistingAccount = (
    user: UserDocument,
    provider: string,
    identity: OAuthIdentity,
    context: CallerContext
): Promise<UserDocument> =>
    userRepository
        .linkOAuthAccount(user.id, {
            provider,
            providerId: identity.providerId,
            connectedAt: new Date()
        })
        .then(() => {
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: accountAuditActions.AUTH_OAUTH_LINKED,
                    actor_user_id: user.id,
                    actor_role: 'user',
                    outcome: 'success',
                    metadata: { via: provider }
                })
            );
            emitAnalyticsEvent({
                ...buildAnalyticsBase(context),
                distinctId: user.id,
                event: accountAnalyticsEvents.USER_LOGGED_IN
            });
            return user;
        });

/** Create a fresh, password-less account for a never-seen identity — the case-3 tail. */
const signupFromOAuth = (
    provider: string,
    identity: OAuthIdentity,
    context: CallerContext
): Promise<UserDocument> =>
    userRepository
        .create({
            email: identity.email,
            // No display name from the provider: the address is at least unique, unlike a blank.
            username: identity.name ?? identity.email,
            imageUrl: identity.imageUrl ?? process.env.NODE_DEFAULT_IMAGE_USER ?? '',
            // The provider vouches for this identity, same reasoning `userService.create`'s admin
            // path already applies to a typed-in address — no password, so no email loop either.
            verified: true,
            active: true,
            locale: getCurrentLocale(),
            oauthAccounts: [{ provider, providerId: identity.providerId, connectedAt: new Date() }]
            // A concurrent signup for this SAME identity is the race `users_oauth_identity`
            // (unique) exists for: the loser's `create` rejects with E11000, which the callback
            // controller's catch turns into a generic `?error=provider_error` — the caller simply
            // tries again, and the second attempt finds case 1.
        })
        .then((created) => {
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: accountAuditActions.AUTH_SIGNED_UP,
                    actor_user_id: created.id,
                    actor_role: 'user',
                    outcome: 'success',
                    metadata: { via: provider }
                })
            );
            emitAnalyticsEvent({
                ...buildAnalyticsBase(context),
                distinctId: created.id,
                event: accountAnalyticsEvents.USER_SIGNED_UP
            });
            return created;
        });

/**
 * Resolve an `OAuthIdentity` to a `UserDocument`, creating or linking as needed, and record
 * whichever of the three outcomes happened.
 *
 * `providerId`, never `email`, is the identity key looked up first — an email match is only
 * consulted when no identity is already on file, and only ever LINKS, never silently logs in:
 * an attacker cannot borrow someone else's email to walk into their account.
 *
 * @param provider - the registry name (`'google'`, `'github'`, ...)
 * @param identity - what the provider's token exchange resolved
 * @param context - for the audit/analytics emitted here
 * @throws {@link OAuthEmailUnverifiedError} when an existing account matches by email but the
 *   provider does not vouch for it
 */
export const loginOrCreateFromOAuth = (
    provider: string,
    identity: OAuthIdentity,
    context: CallerContext
): Promise<UserDocument> =>
    userRepository
        .findOne({
            'oauthAccounts.provider': provider,
            'oauthAccounts.providerId': identity.providerId
        })
        .then((existing) => {
            if (existing) return recordLogin(existing, provider, context);

            return userRepository.findOne({ email: identity.email }).then((byEmail) => {
                if (!byEmail) return signupFromOAuth(provider, identity, context);

                if (!identity.emailVerified) throw new OAuthEmailUnverifiedError(identity.email);

                return linkToExistingAccount(byEmail, provider, identity, context);
            });
        });

/**
 * Record an OAuth attempt that did not reach {@link loginOrCreateFromOAuth} at all — an unknown
 * `state`, a declined consent, an exchange the provider refused. The callback controller is the
 * only caller: it is the one place that knows these facts, since none of them name a user.
 *
 * @param provider - the registry name the attempt named
 * @param reason - a short, closed code (`'invalid_state'`, `'access_denied'`, `'provider_error'`) —
 *   the same value the controller redirects the frontend with
 */
export const recordOAuthFailure = (
    context: CallerContext,
    provider: string,
    reason: string
): void => {
    emitAuditEvent(
        buildAuditEvent(context, {
            action: accountAuditActions.AUTH_OAUTH_FAILED,
            outcome: 'failure',
            metadata: { provider, reason }
        })
    );
};
