/**
 * @module
 * Account service — authentication, the profile a person manages, and two-factor. A folder rather
 * than one file because it passed ~300 lines, split by what each operation does — see
 * `docs/theory/layers.md`.
 *
 * `accountService`:   login, signup, profile, verification, tokens, OAuth.
 * `twoFactorService`: enrollment, removal, backup codes, the login challenge.
 *
 * Two, not one:    neither group calls the other, so one object each keeps a caller of
 *                  `accountService.login` from being coupled, to TypeScript, to 2FA as well.
 * Prefer direct:   import the one function you need from its own file when a caller needs only a
 *                  name or two; the namespaces exist so the surface can still be browsed by name.
 * Below this:      `../session/` — JWT signing, the refresh cookie, shared expiry. Nothing
 *                  outside this module imports it directly; see `../index`.
 *
 * `./export` and `./export-job` are NOT imported here, on purpose. The build reaches
 * `cart`/`wishlist`/`orders`/… for the data-export payload, and this file is what the barrel
 * (`../index.ts`) publishes wholesale — one static import away from it puts every one of those
 * modules' barrels in this module's own reachability, which is how a sibling importing
 * `@modules/account` for anything at all risks a cycle. The export controllers and `../module.ts`
 * import them directly instead — this module's own files, not a barrel concern. `./export-rows`
 * (the reaper) reaches nothing but this module's own store, so it is published.
 */

import * as authentication from './authentication';
import * as profile from './profile';
import * as verification from './verification';
import * as tokens from './tokens';
import * as tokenCleanup from './token-cleanup';
import * as exportRows from './export-rows';
import * as oauth from './oauth';
import * as twoFactor from './two-factor';
import * as reauth from './reauth';
import { pruneOwnExpiredTokens } from '../session/prune';

/*
 * Published by name as well as on the namespace, for the callers that import a single function
 * rather than the object — controllers, and the suites that pin one flow. Unused-by-name is
 * allowed on purpose, same as the module barrel itself (CLAUDE.md's "Module barrels"): a caller
 * reaching for a name not listed here copies the logic instead of adding the export it needed.
 */
export {
    PASSWORD_RESET_TOKEN_TYPE,
    RESET_REQUEST_SECONDS,
    ACCOUNT_DELETE_TOKEN_TYPE
} from './authentication';
export { amrAfterReauth } from './reauth';
export { passwordChangeWithCurrent, updateProfile } from './profile';
export {
    sendVerificationEmail,
    EMAIL_VERIFY_TOKEN_TYPE,
    EMAIL_CHANGE_TOKEN_TYPE,
    VERIFY_RESEND_SECONDS,
    completeEmailChange
} from './verification';
export { reapExpiredTokens } from './token-cleanup';
export { reapExpiredExports } from './export-rows';
export { pruneOwnExpiredTokens } from '../session/prune';
export { sendAccountMail } from './mail';
export {
    loginOrCreateFromOAuth,
    recordOAuthFailure,
    OAuthEmailUnverifiedError,
    OAuthAccountUnverifiedError
} from './oauth';

/**
 * Core account functions: login, signup, profile, verification, session tokens, the
 * token-cleanup job, OAuth. Two-factor gets its own namespace below. The address book is
 * `@modules/addresses`, a separate module entirely; data export is `./export`, deliberately not
 * part of this object — see this file's own docblock above.
 */
export const accountService = {
    tokenAdd: authentication.tokenAdd,
    signup: authentication.signup,
    login: authentication.login,
    logoutEverywhere: authentication.logoutEverywhere,
    requestAccountDeletion: authentication.requestAccountDeletion,
    requestPasswordReset: authentication.requestPasswordReset,
    requestAccountSetup: authentication.requestAccountSetup,
    sessionRevoke: authentication.sessionRevoke,
    logoutCurrentSession: authentication.logoutCurrentSession,
    refreshAccessToken: authentication.refreshAccessToken,
    reauth: reauth.reauth,
    reauthMethods: reauth.reauthMethods,
    sendReauthCode: reauth.sendReauthCode,
    validatePasswordChange: profile.validatePasswordChange,
    passwordChange: profile.passwordChange,
    passwordChangeWithCurrent: profile.passwordChangeWithCurrent,
    passwordResetChange: profile.passwordResetChange,
    completePasswordReset: profile.completePasswordReset,
    updateProfile: profile.updateProfile,
    cancelPendingEmailChange: profile.cancelPendingEmailChange,
    getOwnProfile: profile.getOwnProfile,
    removeOwnAccount: profile.removeOwnAccount,
    sendVerificationEmail: verification.sendVerificationEmail,
    requestEmailVerification: verification.requestEmailVerification,
    requestEmailVerificationFor: verification.requestEmailVerificationFor,
    resendPendingEmailVerificationFor: verification.resendPendingEmailVerificationFor,
    completeEmailVerification: verification.completeEmailVerification,
    completeEmailChange: verification.completeEmailChange,
    findLiveToken: tokens.findLiveToken,
    spendLiveToken: tokens.spendLiveToken,
    redeemLiveToken: tokens.redeemLiveToken,
    sessionsList: tokens.sessionsList,
    reapExpiredTokens: tokenCleanup.reapExpiredTokens,
    reapExpiredExports: exportRows.reapExpiredExports,
    pruneOwnExpiredTokens,
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
    sendMethodCode: twoFactor.sendMethodCode,
    confirmTwoFactorMethod: twoFactor.confirmTwoFactorMethod,
    removeTwoFactorMethod: twoFactor.removeTwoFactorMethod,
    disableTwoFactor: twoFactor.disableTwoFactor,
    regenerateBackupCodes: twoFactor.regenerateBackupCodes,
    sendLoginCode: twoFactor.sendLoginCode,
    verifyLoginChallenge: twoFactor.verifyLoginChallenge
};
