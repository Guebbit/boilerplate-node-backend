/**
 * @module
 * OAuth login/signup — the OAuth counterpart to `./authentication.ts`'s `login`/`signup`, one
 * layer above `../oauth/`'s provider mechanics (which know nothing about `UserDocument` or
 * audit/analytics — see that folder's own files). Three outcomes only: an already-linked identity
 * logs in, an email BOTH sides call verified links a NEW identity onto an existing password
 * account, and anything else signs up a fresh, password-less user.
 */

import { getCurrentLocale } from '@infrastructure/i18n';
import { userService, type UserDocument } from '@modules/users';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { accountAnalyticsEvents } from '../analytics';
import { accountAuditActions } from '../audit';
import { isUnrestrictedCaller } from '../roles';
import type { OAuthIdentity } from '../oauth/providers/port';
import { assignRole, VERIFIED_CUSTOMER_ROLE } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';

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

/**
 * The provider vouches for this identity, and its email matches an existing account — but that
 * ACCOUNT never proved the address itself. Refusing the link here is what stops a
 * pre-account-takeover: an attacker registers `victim@example.com` with their own password, the
 * victim later signs in with the provider, and without this check they land on the squatter's
 * account with the squatter's password still on it.
 *
 * The victim's way in is the password reset, which proves the same mailbox and marks it verified
 * — see `profile.ts#passwordResetChange`. The callback controller turns this into an
 * `?error=account_unverified` redirect.
 */
export class OAuthAccountUnverifiedError extends Error {
    constructor(email: string) {
        super(`Existing account has not proved its own address, refusing OAuth link: ${email}`);
        this.name = 'OAuthAccountUnverifiedError';
    }
}

/**
 * Link a NEW provider identity onto an existing, verified-match account — the case-2 tail.
 *
 * The link itself always audits — it genuinely happened, with the account's REAL role (an
 * account linking its first provider is not necessarily a plain `user`). The `USER_LOGGED_IN`
 * analytics event is suppressed when the account has 2FA armed: the callback does not mint a
 * session in that case, it issues a challenge instead (see `get-oauth-callback.ts`'s 1b
 * handling), so linking is not yet a completed login.
 */
const linkToExistingAccount = (
    user: UserDocument,
    provider: string,
    identity: OAuthIdentity,
    context: CallerContext
): Promise<UserDocument> =>
    userService
        .linkOAuthAccount(user.id, {
            provider,
            providerId: identity.providerId,
            connectedAt: new Date()
        })
        .then(() =>
            // Read fresh from the membership — the document carries no role of its own, same
            // reasoning `postLogin` gives for its own AUTH_LOGIN.
            isUnrestrictedCaller(user.id).then((unrestricted) => {
                recordAudit(context, {
                    action: accountAuditActions.AUTH_OAUTH_LINKED,
                    actor_user_id: user.id,
                    actor_role: unrestricted ? 'admin' : 'user',
                    outcome: 'success',
                    metadata: { via: provider }
                });
                if (!user.twoFactorEnabledAt) {
                    emitAnalyticsEvent({
                        ...buildAnalyticsBase(context),
                        distinctId: user.id,
                        event: accountAnalyticsEvents.USER_LOGGED_IN
                    });
                }
                return user;
            })
        );

/** Create a fresh, password-less account for a never-seen identity — the case-3 tail. */
const signupFromOAuth = (
    provider: string,
    identity: OAuthIdentity,
    context: CallerContext
): Promise<UserDocument> =>
    userService
        .registerFromOAuth({
            email: identity.email,
            // No display name from the provider: the address is at least unique, unlike a blank.
            username: identity.name ?? identity.email,
            imageUrl: identity.imageUrl ?? process.env.NODE_DEFAULT_IMAGE_USER ?? '',
            // The provider vouches for this identity, same reasoning `userService.create`'s admin
            // path already applies to a typed-in address — no password, so no email loop either.
            // This account skips `unverified` entirely, the same as an operator-created one; the
            // `customer` grant itself is the membership write just below, not a document field.
            verifiedAt: new Date(),
            active: true,
            locale: getCurrentLocale(),
            oauthAccounts: [{ provider, providerId: identity.providerId, connectedAt: new Date() }]
            // A concurrent signup for this SAME identity is the race `users_oauth_identity`
            // (unique) exists for: the loser's `create` rejects with E11000, which the callback
            // controller's catch turns into a generic `?error=provider_error` — the caller simply
            // tries again, and the second attempt finds case 1.
        })
        .then((created) =>
            // Not `assignDefaultRole`'s `unverified`: the provider already vouches for this
            // address, the same reasoning `verifiedAt` above applies. A refused grant undoes the
            // row — same compensation as the self-service signup path in `authentication.ts`.
            assignRole(created.id, DEPLOYMENT_TENANT_ID, 'tenant', VERIFIED_CUSTOMER_ROLE).then(
                () => created,
                (error: unknown) =>
                    userService.discardFailedSignup(created).then(() => {
                        throw error;
                    })
            )
        )
        .then((created) => {
            recordAudit(context, {
                action: accountAuditActions.AUTH_SIGNED_UP,
                actor_user_id: created.id,
                actor_role: 'user',
                outcome: 'success',
                metadata: { via: provider }
            });
            emitAnalyticsEvent({
                ...buildAnalyticsBase(context),
                distinctId: created.id,
                event: accountAnalyticsEvents.USER_SIGNED_UP
            });
            return created;
        });

/**
 * Which of the three branches {@link loginOrCreateFromOAuth} took — the controller needs this to
 * decide whether IT still owes an `AUTH_LOGIN`: a login does, once a session actually exists to
 * record; a link or a signup already audited itself in full here, and recording a second,
 * generic "login" on top would double-count the event.
 */
export type OAuthOutcome = 'login' | 'link' | 'signup';

/**
 * Resolve an `OAuthIdentity` to a `UserDocument`, creating or linking as needed.
 *
 * `providerId`, never `email`, is the identity key looked up first — an email match is only
 * consulted when no identity is already on file, and only ever LINKS, never silently logs in:
 * an attacker cannot borrow someone else's email to walk into their account.
 *
 * An already-linked identity (case 1) records NOTHING here — unlike the link and signup cases,
 * a plain login is not yet a fact until the caller actually mints a session, which is not this
 * function's decision: `get-oauth-callback.ts` calls `recordLoginSuccess` itself once it has,
 * the same way `postLogin`'s own success tail does. Recording it here, unconditionally, is
 * exactly the bug this now avoids: it can only ever emit the SIGNED-IN caller's role, and does
 * not know it — the controller does, once a session exists to look one up for.
 *
 * @param provider - the registry name (`'google'`, `'github'`, ...)
 * @param identity - what the provider's token exchange resolved
 * @param context - for the link/signup audit and analytics emitted here
 * @returns the resolved user, tagged with which branch produced it — see {@link OAuthOutcome}
 * @throws {@link OAuthEmailUnverifiedError} when an existing account matches by email but the
 *   provider does not vouch for it
 * @throws {@link OAuthAccountUnverifiedError} when it matches an account that never proved that
 *   address itself
 */
export const loginOrCreateFromOAuth = (
    provider: string,
    identity: OAuthIdentity,
    context: CallerContext
): Promise<{ user: UserDocument; outcome: OAuthOutcome }> =>
    userService
        // WITH credentials, unlike every other lookup in this file: the controller may need to
        // build a 2FA login challenge off `user.twoFactorMethods`, which is `select: false` —
        // see 1b in docs/theory/defences/authentication.md#federated-login.
        .findByOAuthIdentity(provider, identity.providerId)
        .then((existing) => {
            if (existing) return { user: existing, outcome: 'login' as const };

            // Same reason as the lookup above: `linkToExistingAccount` below may hand this
            // account straight to a 2FA challenge too.
            return userService.findByEmail(identity.email).then((byEmail) => {
                if (!byEmail)
                    return signupFromOAuth(provider, identity, context).then((user) => ({
                        user,
                        outcome: 'signup' as const
                    }));

                if (!identity.emailVerified) throw new OAuthEmailUnverifiedError(identity.email);

                // Both sides must have proved the address, not just the provider — see
                // `OAuthAccountUnverifiedError`.
                if (!byEmail.verifiedAt) throw new OAuthAccountUnverifiedError(identity.email);

                return linkToExistingAccount(byEmail, provider, identity, context).then((user) => ({
                    user,
                    outcome: 'link' as const
                }));
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
    recordAudit(context, {
        action: accountAuditActions.AUTH_OAUTH_FAILED,
        outcome: 'failure',
        metadata: { provider, reason }
    });
};
