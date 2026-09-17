/**
 * @module
 * Account service — authentication, the profile a person manages, two-factor, and the address
 * book. A folder rather than one file because it passed ~300 lines, split by what each operation
 * does — see `docs/theory/layers.md`.
 *
 * `accountService`:   login, signup, profile, verification, tokens, OAuth.
 * `twoFactorService`: enrollment, removal, backup codes, the login challenge.
 * `addressService`:   the address book's CRUD, plus the address a checkout resolves.
 *
 * Three, not one:  none of the three groups calls another, so one object each keeps a caller of
 *                  `accountService.login` from being coupled, to TypeScript, to 2FA and the
 *                  address book as well.
 * Prefer direct:   import the one function you need from its own file when a caller needs only a
 *                  name or two; the namespaces exist so the surface can still be browsed by name.
 * Below this:      `../session/` — JWT signing, the refresh cookie, shared expiry. Nothing
 *                  outside this module imports it directly; see `../index`.
 *
 * `./export` is NOT imported here, on purpose. It reaches `cart`/`wishlist`/`orders`/… for the
 * data-export payload, and this file is what the barrel (`../index.ts`) publishes wholesale — one
 * static import away from `exportOwnData` puts every one of those modules' barrels in this
 * module's own reachability, which is exactly how `cart`'s checkout (itself reaching back into
 * `account` for an address) turned into a real import cycle. `../controllers/post-account-export`
 * imports `./export` directly instead — this module's own file, not a barrel concern.
 */

import * as authentication from './authentication';
import * as profile from './profile';
import * as verification from './verification';
import * as tokens from './tokens';
import * as tokenCleanup from './token-cleanup';
import * as oauth from './oauth';
import * as twoFactor from './two-factor';
import * as addresses from './addresses';

/*
 * Published by name as well as on the namespace, for the callers that import a single function
 * rather than the object — controllers, and the suites that pin one flow. Unused-by-name is
 * allowed on purpose, same as the module barrel itself (CLAUDE.md's "Module barrels"): a caller
 * reaching for a name not listed here copies the logic instead of adding the export it needed.
 */
export { PASSWORD_RESET_TOKEN_TYPE } from './authentication';
export { passwordChangeWithCurrent, updateProfile } from './profile';
export {
    sendVerificationEmail,
    EMAIL_VERIFY_TOKEN_TYPE,
    EMAIL_CHANGE_TOKEN_TYPE,
    VERIFY_RESEND_SECONDS,
    completeEmailChange
} from './verification';
export { runTokenCleanup } from './token-cleanup';
export {
    loginOrCreateFromOAuth,
    recordOAuthFailure,
    OAuthEmailUnverifiedError,
    OAuthAccountUnverifiedError
} from './oauth';
export { addressForCheckout } from './addresses';

/**
 * Core account functions: login, signup, profile, verification, session tokens, the
 * token-cleanup job, data export, OAuth. Everything except two-factor and the address book, which
 * get their own namespace below.
 */
export const accountService = {
    tokenAdd: authentication.tokenAdd,
    signup: authentication.signup,
    login: authentication.login,
    tokenRemoveAll: authentication.tokenRemoveAll,
    requestAccountDeletion: authentication.requestAccountDeletion,
    requestPasswordReset: authentication.requestPasswordReset,
    requestAccountSetup: authentication.requestAccountSetup,
    sessionRevoke: authentication.sessionRevoke,
    logoutCurrentSession: authentication.logoutCurrentSession,
    refreshAccessToken: authentication.refreshAccessToken,
    reauth: authentication.reauth,
    validatePasswordChange: profile.validatePasswordChange,
    passwordChange: profile.passwordChange,
    passwordChangeWithCurrent: profile.passwordChangeWithCurrent,
    passwordResetChange: profile.passwordResetChange,
    updateProfile: profile.updateProfile,
    getOwnProfile: profile.getOwnProfile,
    removeOwnAccount: profile.removeOwnAccount,
    sendVerificationEmail: verification.sendVerificationEmail,
    requestEmailVerification: verification.requestEmailVerification,
    requestEmailVerificationFor: verification.requestEmailVerificationFor,
    completeEmailVerification: verification.completeEmailVerification,
    completeEmailChange: verification.completeEmailChange,
    findLiveToken: tokens.findLiveToken,
    spendLiveToken: tokens.spendLiveToken,
    sessionsList: tokens.sessionsList,
    runTokenCleanup: tokenCleanup.runTokenCleanup,
    adminTokenCleanup: tokenCleanup.adminTokenCleanup,
    loginOrCreateFromOAuth: oauth.loginOrCreateFromOAuth,
    recordOAuthFailure: oauth.recordOAuthFailure
};

/**
 * Two-factor authentication: enrollment, removal, backup codes, and the login-time
 * challenge/verify pair.
 */
export const twoFactorService = {
    buildLoginChallenge: twoFactor.buildLoginChallenge,
    twoFactorStatus: twoFactor.twoFactorStatus,
    setupTwoFactorMethod: twoFactor.setupTwoFactorMethod,
    confirmTwoFactorMethod: twoFactor.confirmTwoFactorMethod,
    removeTwoFactorMethod: twoFactor.removeTwoFactorMethod,
    disableTwoFactor: twoFactor.disableTwoFactor,
    regenerateBackupCodes: twoFactor.regenerateBackupCodes,
    sendLoginCode: twoFactor.sendLoginCode,
    verifyLoginChallenge: twoFactor.verifyLoginChallenge
};

/**
 * The address book: list, add, update, remove, and the two cross-cutting reads (checkout's
 * lookup, the cascade delete when a user account goes away).
 */
export const addressService = {
    addressesGet: addresses.addressesGet,
    addressAdd: addresses.addressAdd,
    addressUpdate: addresses.addressUpdate,
    addressRemove: addresses.addressRemove,
    addressForCheckout: addresses.addressForCheckout,
    addressesDeleteByUserId: addresses.addressesDeleteByUserId
};
