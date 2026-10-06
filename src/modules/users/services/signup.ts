/**
 * @module
 * Account creation for `account`'s flows: self-service, OAuth, the decoy, and the undo.
 */

import type { UserDocument } from '../model';
import { userRepository } from '../repository';

/** The fields signup's anti-automation decoy path may set — never `verifiedAt`, which is never persisted anyway. */
export type SignupDecoyFields = Pick<
    UserDocument,
    'email' | 'username' | 'imageUrl' | 'thumbnailUrl' | 'analyticsConsent' | 'termsAccepted'
>;

/**
 * Construct a document WITHOUT persisting it — signup's anti-automation deception path answers
 * with a document that looks real and was never written, so a policy-refused attempt gets nothing
 * to distinguish it from a genuine one.
 */
export const buildSignupDecoy = (data: SignupDecoyFields) => userRepository.build(data);

/**
 * The fields a self-service signup may set — deliberately excludes `verifiedAt`/`active`/
 * `oauthAccounts`, which {@link registerFromOAuth} alone may set: passing any of them here would
 * let a self-service signup skip email verification the same way a provider-vouched one does.
 */
export type SelfServiceSignupFields = Pick<
    UserDocument,
    | 'username'
    | 'email'
    | 'imageUrl'
    | 'thumbnailUrl'
    | 'pendingImageKey'
    | 'password'
    | 'analyticsConsent'
    | 'termsAccepted'
    | 'locale'
>;

/**
 * A self-service signup, from the request's own fields — `account`'s OWN orchestration
 * (anti-automation checks, the duplicate-email pre-check, the verification email) runs around
 * this, never `create()`'s admin-panel one (role assignment, admin audit/analytics). Writes no
 * role of its own: the document holds none, and the caller grants `unverified` separately through
 * `assignDefaultRole` — never this function, which never sees a role name to misuse.
 */
export const registerSelfService = (data: SelfServiceSignupFields) => userRepository.create(data);

/** The fields an OAuth-vouched signup may set — see {@link registerFromOAuth}. */
export type OAuthSignupFields = Pick<
    UserDocument,
    | 'email'
    | 'username'
    | 'imageUrl'
    | 'thumbnailUrl'
    | 'verifiedAt'
    | 'active'
    | 'locale'
    | 'oauthAccounts'
>;

/**
 * An account minted from a federated identity — the provider vouches for it, so its caller grants
 * `customer` directly (through `assignRole`, not `assignDefaultRole`) rather than `unverified`,
 * the same way an operator-created account does. Same "writes no role itself" split as
 * {@link registerSelfService} — `verifiedAt` is set at the call site, the membership grant happens
 * there too, never inside this function. Kept as a separate function from
 * {@link registerSelfService} rather than merged despite the identical one-line body: the two
 * field sets below are what actually matters, and a caller passing the wrong one is exactly the
 * mistake narrowing each exists to catch at compile time.
 */
export const registerFromOAuth = (data: OAuthSignupFields) => userRepository.create(data);

/**
 * Undo a just-created signup row whose starting-role grant then failed — a hard delete, not
 * `remove()`: that runs the full erasure cascade and revokes a membership through `access`, both
 * wrong for a row that never finished becoming an account. Left behind, it would keep the email
 * permanently unusable for a retry. Not `remove()`, so not the barrel: this is a compensating step
 * for `account`'s own signup orchestration, not a general-purpose delete.
 */
export const discardFailedSignup = (user: UserDocument): Promise<void> =>
    userRepository.deleteOne(user).then(() => undefined);

/**
 * Detach one provider from an account.
 *
 * @returns whether a link was removed; `false` when `provider` was never linked
 */
export const unlinkOAuthAccount = (userId: string, provider: string): Promise<boolean> =>
    userRepository.unlinkOAuthAccount(userId, provider);

/** Attach a federated identity to an existing account. */
export const linkOAuthAccount = (
    userId: string,
    account: Parameters<typeof userRepository.linkOAuthAccount>[1]
) => userRepository.linkOAuthAccount(userId, account);
