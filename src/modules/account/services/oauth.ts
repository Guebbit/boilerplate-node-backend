/**
 * @module
 * OAuth login/signup — the OAuth counterpart to `./login.ts`'s `login` and `./signup.ts`'s `signup`, one
 * layer above `../oauth/`'s provider mechanics (which know nothing about `UserDocument` or
 * audit/analytics — see that folder's own files). Three outcomes only: an already-linked identity
 * logs in, an email that matches an existing account is refused (linking needs a signed-in
 * session), and anything else signs up a fresh, password-less user. Connecting a provider to a
 * signed-in account is its own pair of steps: `startOAuthLink`, then `linkProviderToSignedInAccount`.
 */

import { getCurrentLocale } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { userService, isAuthenticatable, type UserDocument } from '@modules/users';
import { imageStore } from '@infrastructure/adapters/image-store';
import { rehostRemoteImage } from '@infrastructure/adapters/remote-image';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { accountAnalyticsEvents } from '../analytics';
import { accountAuditActions } from '../audit';
import { recordAccountAudit } from './caller';
import type { OAuthIdentity } from '../oauth/providers/port';
import { termsAcceptance } from '../consent-record';
import { OAUTH_LINK_TOKEN_TYPE, OAUTH_LINK_TTL_MS } from '../token-types';
import { greetableName, recipientLocale, signInMethodChangedEmail } from '../emails';
import type { SignInMethodChange } from '../emails';
import { sendAccountMail } from './mail';
import { issueToken, redeemLiveToken } from './tokens';

/**
 * The provider vouches for this identity, but its email matches an EXISTING account whose own
 * email the provider does not claim as verified — refusing the link here is what stops anyone who
 * can register an OAuth app under a victim's address from taking over that account. The callback
 * controller turns this into a `?error=email_unverified` redirect, never a generic failure.
 */
export class OAuthEmailUnverifiedError extends Error {
    /** @param email - the address the provider asserted, for the log line. */
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
 * — see `password-reset.ts#completePasswordReset`. The callback controller turns this into an
 * `?error=account_unverified` redirect.
 */
export class OAuthAccountUnverifiedError extends Error {
    /** @param email - the address the existing account holds, for the log line. */
    constructor(email: string) {
        super(`Existing account has not proved its own address, refusing OAuth link: ${email}`);
        this.name = 'OAuthAccountUnverifiedError';
    }
}

/**
 * The address matches an account that may not authenticate (banned, or soft-deleted). Refused
 * before anything is written: a link left on it would outlive an unban or a restore, and a signup
 * would collide with its address. The callback controller answers it as `provider_error`, so the
 * frontend needs no new case and the caller learns nothing about the account's state.
 */
export class OAuthAccountUnavailableError extends Error {
    /** @param userId - the account that was refused, for the log line. */
    constructor(userId: string) {
        super(`OAuth sign-in matched an account that may not authenticate: ${userId}`);
        this.name = 'OAuthAccountUnavailableError';
    }
}

/**
 * The provider vouches for this identity and its email matches an existing, verified account — but
 * nobody is signed in to that account. A sign-in does not link a provider by email match: NIST
 * SP 800-63C-4 §3.8.1 says the relying party SHALL require an authenticated session with the
 * subscriber account for every linking function. The caller signs in the way the account allows
 * and connects the provider from their profile (`startOAuthLink`). The callback controller turns
 * this into `?error=account_exists`.
 */
export class OAuthAccountExistsError extends Error {
    /** @param email - the address the provider asserted, for the log line. */
    constructor(email: string) {
        super(
            `OAuth identity matches an existing account; linking needs a signed-in session: ${email}`
        );
        this.name = 'OAuthAccountExistsError';
    }
}

/**
 * A signed-in account tried to connect a provider identity that already belongs to another account.
 * One provider account signs in to one account here (`users_oauth_identity` is unique), so the
 * callback answers `?error=already_linked` and links nothing.
 */
export class OAuthIdentityTakenError extends Error {
    /** @param provider - the registry name, for the log line. */
    constructor(provider: string) {
        super(`OAuth ${provider} identity already belongs to another account`);
        this.name = 'OAuthIdentityTakenError';
    }
}

/**
 * The connect attempt's token is missing, spent or expired: the person took longer than the
 * minutes the attempt lives, or the callback was replayed. The callback answers `?error=link_expired`.
 */
export class OAuthLinkExpiredError extends Error {
    constructor() {
        super('OAuth connect attempt expired or already used');
        this.name = 'OAuthLinkExpiredError';
    }
}

/**
 * Tell the account holder, out of band, that a sign-in provider was connected or removed.
 * Fire-and-forget: the change already happened, and a queue that is briefly down must not turn it
 * into an error.
 *
 * @param user - the account, carrying its address and locale
 * @param change - connected or removed
 * @param provider - the registry name
 * @param context - the caller, whose locale is the fallback
 */
const notifySignInMethod = (
    user: UserDocument,
    change: SignInMethodChange,
    provider: string,
    context: CallerContext
): void => {
    void sendAccountMail(
        user.email,
        signInMethodChangedEmail(
            recipientLocale(user.locale, context),
            greetableName(user, user.email),
            change,
            provider
        ),
        'normal'
    ).catch((error: unknown) => {
        logger.warn({ message: 'Could not queue a sign-in method notice.', error });
    });
};

/**
 * Start connecting a provider to the SIGNED-IN account: a short-lived token the callback redeems to
 * learn which account is connecting. The caller sets it as a cookie beside the state and verifier.
 *
 * @param userId - the signed-in account
 * @returns the plaintext token
 */
export const startOAuthLink = (userId: string): Promise<string> =>
    issueToken(userId, OAUTH_LINK_TOKEN_TYPE, OAUTH_LINK_TTL_MS);

/**
 * Finish connecting a provider to the account that started it. The identity links to THAT account
 * whatever its email says; an identity another account already holds is refused.
 *
 * The link always audits — it genuinely happened — and mails the owner (NIST SP 800-63C-4 §3.8):
 * a change made from a stolen session is otherwise silent. An account that already holds this
 * provider simply stays connected, with nothing new to record.
 *
 * @param linkToken - the `oauth-link` token the start put in the cookie
 * @param sessionUserId - the account the browser is signed in as right now, or `undefined` when it
 *   holds no live session. The token alone is not proof: it rides a cookie, and a planted one would
 *   otherwise link the victim's provider identity to the account that minted it
 * @param provider - the registry name
 * @param identity - what the provider's token exchange resolved
 * @param context - for the audit row and the mail's locale
 * @returns the account that connected
 * @throws {@link OAuthLinkExpiredError} for a missing, spent or expired token, or a browser that is
 *   not signed in as the account the token was minted for
 * @throws {@link OAuthAccountUnavailableError} for an account that may no longer authenticate
 * @throws {@link OAuthIdentityTakenError} for an identity another account holds
 */
export const linkProviderToSignedInAccount = (
    linkToken: string | undefined,
    sessionUserId: string | undefined,
    provider: string,
    identity: OAuthIdentity,
    context: CallerContext
): Promise<UserDocument> =>
    redeemLiveToken(OAUTH_LINK_TOKEN_TYPE, linkToken ?? '').then((user) => {
        if (!user) throw new OAuthLinkExpiredError();
        // Refused as an expired attempt: the FE has one message for it, and a new reason code would
        // be a contract change. A session that ended inside the five minutes fails the link too.
        if (sessionUserId !== user.id) throw new OAuthLinkExpiredError();
        if (!isAuthenticatable(user)) throw new OAuthAccountUnavailableError(user.id);

        return userService.findByOAuthIdentity(provider, identity.providerId).then((owner) => {
            if (owner && owner.id !== user.id) throw new OAuthIdentityTakenError(provider);

            return userService
                .linkOAuthAccount(user.id, {
                    provider,
                    providerId: identity.providerId,
                    connectedAt: new Date()
                })
                .then((linked) => {
                    if (!linked) return user;

                    return recordAccountAudit(context, user.id, {
                        action: accountAuditActions.AUTH_OAUTH_LINKED,
                        outcome: 'success',
                        metadata: { via: provider }
                    }).then(() => {
                        notifySignInMethod(user, 'linked', provider, context);
                        return user;
                    });
                });
        });
    });

/**
 * A provider claim, or `undefined` when it is missing, blank or whitespace. OIDC Core §5.3.2 says
 * an unreturned claim should be absent, but a non-conformant provider may send `''` — and a blank
 * would fail the account's `required` username, or store an empty `imageUrl`.
 *
 * @param value - the raw claim off the provider's identity
 */
export const presentClaim = (value: string | undefined): string | undefined => {
    return value?.trim() || undefined;
};

/**
 * Undo the re-hosted avatar of a signup that did not finish — nothing will ever reference it.
 *
 * @param avatar - what {@link rehostRemoteImage} stored, if anything
 * @param error - the failure to rethrow once the files are gone
 */
const discardAvatar = (avatar: { imageUrl: string } | undefined, error: unknown): Promise<never> =>
    imageStore.remove(avatar?.imageUrl).then(() => {
        throw error;
    });

/** Create a fresh, password-less account for a never-seen identity — the case-3 tail. */
const signupFromOAuth = (
    provider: string,
    identity: OAuthIdentity,
    context: CallerContext
): Promise<UserDocument> =>
    // Downloaded ONCE, here: the account keeps a local copy, never the provider's url, so no
    // render ever sends a viewer's IP to the provider's host. Absent on any failure.
    rehostRemoteImage(presentClaim(identity.imageUrl)).then((avatar) =>
        // `verifiedAt` below is the whole of the vouching: the provider vouches for this address,
        // so the account is a `customer` from its first request. A failure leaves no row behind,
        // only the re-hosted avatar to discard.
        userService
            .registerFromOAuth({
                email: identity.email,
                // No display name from the provider: the address is at least unique, unlike a blank.
                username: presentClaim(identity.name) ?? identity.email,
                imageUrl: avatar?.imageUrl,
                thumbnailUrl: avatar?.thumbnailUrl,
                // The provider vouches for this identity, same reasoning `userService.create`'s admin
                // path already applies to a typed-in address — no password, so no email loop either.
                verifiedAt: new Date(),
                active: true,
                locale: getCurrentLocale(),
                // The sign-in notice beside the provider buttons is the acceptance.
                ...termsAcceptance(),
                oauthAccounts: [
                    { provider, providerId: identity.providerId, connectedAt: new Date() }
                ]
                // A concurrent signup for this SAME identity is the race `users_oauth_identity`
                // (unique) exists for: the loser's `create` rejects with E11000, which the callback
                // controller's catch turns into a generic `?error=provider_error` — the caller simply
                // tries again, and the second attempt finds case 1.
            })
            .catch((error: unknown) => discardAvatar(avatar, error))
            .then((created) => {
                recordAudit(context, {
                    action: accountAuditActions.AUTH_SIGNED_UP,
                    actorUserId: created.id,
                    actorRole: 'user',
                    outcome: 'success',
                    metadata: { via: provider }
                });
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(context),
                    distinctId: created.id,
                    event: accountAnalyticsEvents.USER_SIGNED_UP
                });
                return created;
            })
    );

/**
 * Which branch {@link loginOrCreateFromOAuth} took — the controller needs this to decide whether
 * IT still owes an `AUTH_LOGIN`: a login does, once a session actually exists to record; a signup
 * already audited itself in full here, and recording a second, generic "login" on top would
 * double-count the event.
 */
export type OAuthOutcome = 'login' | 'signup';

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
 * @throws {@link OAuthEmailUnverifiedError} when the provider does not vouch for the address, whether or not an
 *   account already holds it
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
                // Unverified is refused on BOTH branches: a signup would stamp `verifiedAt` on an
                // address nobody proved, which pre-hijacks it (Sudhodanan & Paverd 2022).
                if (!identity.emailVerified) throw new OAuthEmailUnverifiedError(identity.email);

                // BEFORE any write, and before the signup branch: this address belongs to an
                // account that may not authenticate, so neither a link nor a new account fits.
                if (byEmail && !isAuthenticatable(byEmail))
                    throw new OAuthAccountUnavailableError(byEmail.id);

                if (!byEmail)
                    return signupFromOAuth(provider, identity, context).then((user) => ({
                        user,
                        outcome: 'signup' as const
                    }));

                // Both sides must have proved the address, not just the provider — see
                // `OAuthAccountUnverifiedError`.
                if (!byEmail.verifiedAt) throw new OAuthAccountUnverifiedError(identity.email);

                // Never a silent link: the account's owner connects the provider from a session.
                throw new OAuthAccountExistsError(identity.email);
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

/**
 * The sign-in providers linked to an account — what `GET /account/oauth/links` shows. The
 * provider's own identifier stays server-side: it is the key the login looks up, and the owner has
 * no use for it.
 *
 * @param userId - the caller
 * @returns one entry per linked provider, in the order they were connected
 */
export const listOAuthLinks = (
    userId: string
): Promise<{ provider: string; connectedAt: Date }[]> =>
    // `oauthAccounts` is `select: false`, hence the credentialed read.
    userService.findByIdWithCredentials(userId).then((user) =>
        (user?.oauthAccounts ?? []).map(({ provider, connectedAt }) => ({
            provider,
            connectedAt
        }))
    );

/**
 * Disconnect one provider from the caller's account. There is no guard on removing the last
 * sign-in method: forgot-password recovers a passwordless account, and an owner locking
 * themselves out of their own sign-in is theirs to repair.
 *
 * @param userId - the caller
 * @param provider - the registry name to disconnect
 * @param context - for the audit row
 * @returns whether a link was removed; `false` when it was never linked (answered 404)
 */
export const unlinkOAuthProvider = (
    userId: string,
    provider: string,
    context: CallerContext
): Promise<boolean> =>
    userService.unlinkOAuthAccount(userId, provider).then((removed) => {
        if (!removed) return removed;

        recordAudit(context, {
            action: accountAuditActions.AUTH_OAUTH_UNLINKED,
            actorUserId: userId,
            outcome: 'success',
            metadata: { via: provider }
        });
        // Told after the fact, like a connect: whoever removed it, the owner reads about it.
        return userService.findByIdWithCredentials(userId).then((user) => {
            if (user) notifySignInMethod(user, 'unlinked', provider, context);
            return removed;
        });
    });
