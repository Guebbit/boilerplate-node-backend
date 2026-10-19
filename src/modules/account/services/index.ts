/**
 * @module
 * Account service — authentication, the profile a person manages, and two-factor. One file per
 * flow, not one big file — see `docs/theory/layers.md`.
 *
 * `accountService`:   login, signup, profile, verification, tokens, OAuth.
 * `twoFactorService`: enrollment, removal, backup codes, the login challenge.
 *
 * Two, not one:    neither group calls the other, so one object each keeps a caller of
 *                  `accountService.login` from being coupled, to TypeScript, to 2FA as well.
 * One door:        every operation is on one of the two objects and nowhere by name; constants,
 *                  error classes and pure helpers stay named exports.
 * Below this:      `../session/` — JWT signing, the refresh cookie, shared expiry. Nothing
 *                  outside this module imports it directly; see `../index`.
 *
 * Not here:       `./export` and `./export-job`. They are this module's own wiring (queue, file
 *                  store, mail budget), so only the export controllers and `../module.ts`
 *                  import them, directly.
 * Export data:     no sibling's data is reached. Every module declares its own `personalData`
 *                  section, and `../module.ts` hands the resolved list in.
 * Published:       `./export-rows` (the reaper). It reaches nothing but this module's own store.
 */

import * as signup from './signup';
import * as login from './login';
import * as logout from './logout';
import * as refresh from './refresh';
import * as passwordResetRequest from './password-reset-request';
import * as deletionRequest from './deletion-request';
import * as password from './password';
import * as passwordReset from './password-reset';
import * as emailChange from './email-change';
import * as selfDelete from './self-delete';
import * as profile from './profile';
import * as verification from './verification';
import * as tokens from './tokens';
import * as previousEmailCleanup from './previous-email-cleanup';
import * as sessions from './sessions';
import * as exportRows from './export-rows';
import * as oauth from './oauth';
import * as twoFactorEnrollment from './two-factor-enrollment';
import * as twoFactorChallenge from './two-factor-challenge';
import * as reauth from './reauth';
import * as reapInactive from './reap-inactive';
import * as reencrypt from './reencrypt';
import * as mail from './mail';

export {
    PASSWORD_RESET_TOKEN_TYPE,
    ACCOUNT_DELETE_TOKEN_TYPE,
    EMAIL_VERIFY_TOKEN_TYPE,
    EMAIL_CHANGE_TOKEN_TYPE,
    EMAIL_CHANGE_UNDO_TOKEN_TYPE
} from '../token-types';
export { RESET_REQUEST_SECONDS } from './password-reset-request';
export { amrAfterReauth } from './reauth';
export { VERIFY_RESEND_SECONDS } from './verification';
export {
    OAuthEmailUnverifiedError,
    OAuthAccountUnverifiedError,
    OAuthAccountUnavailableError,
    OAuthAccountExistsError,
    OAuthIdentityTakenError,
    OAuthLinkExpiredError
} from './oauth';

/**
 * Core account functions: login, signup, profile, verification, sessions and one-time tokens, the
 * previous-email sweep, OAuth. Two-factor gets its own namespace below. The address book is
 * `@modules/addresses`, a separate module entirely; data export is `./export`, deliberately not
 * part of this object — see this file's own docblock above.
 */
export const accountService = {
    signup: signup.signup,
    login: login.login,
    logoutEverywhere: logout.logoutEverywhere,
    requestAccountDeletion: deletionRequest.requestAccountDeletion,
    requestPasswordReset: passwordResetRequest.requestPasswordReset,
    requestAccountSetup: passwordResetRequest.requestAccountSetup,
    sessionRevoke: logout.sessionRevoke,
    logoutCurrentSession: logout.logoutCurrentSession,
    refreshAccessToken: refresh.refreshAccessToken,
    reauth: reauth.reauth,
    reauthMethods: reauth.reauthMethods,
    sendReauthCode: reauth.sendReauthCode,
    validatePasswordChange: password.validatePasswordChange,
    passwordChangeWithCurrent: password.passwordChangeWithCurrent,
    completePasswordReset: passwordReset.completePasswordReset,
    updateProfile: profile.updateProfile,
    cancelPendingEmailChange: emailChange.cancelPendingEmailChange,
    getOwnProfile: profile.getOwnProfile,
    sendVerificationEmail: verification.sendVerificationEmail,
    requestEmailVerification: verification.requestEmailVerification,
    requestEmailVerificationFor: verification.requestEmailVerificationFor,
    resendPendingEmailVerificationFor: verification.resendPendingEmailVerificationFor,
    confirmEmailVerification: verification.confirmEmailVerification,
    confirmEmailChange: verification.confirmEmailChange,
    undoEmailChangeByToken: verification.undoEmailChangeByToken,
    confirmAccountDeletion: selfDelete.confirmAccountDeletion,
    completeEmailVerification: verification.completeEmailVerification,
    completeEmailChange: verification.completeEmailChange,
    undoEmailChange: verification.undoEmailChange,
    recordOneTimeTokenRejected: tokens.recordOneTimeTokenRejected,
    sessionsList: sessions.sessionsList,
    reapLapsedPreviousEmails: previousEmailCleanup.reapLapsedPreviousEmails,
    reapExpiredExports: exportRows.reapExpiredExports,
    loginOrCreateFromOAuth: oauth.loginOrCreateFromOAuth,
    startOAuthLink: oauth.startOAuthLink,
    linkProviderToSignedInAccount: oauth.linkProviderToSignedInAccount,
    recordOAuthFailure: oauth.recordOAuthFailure,
    listOAuthLinks: oauth.listOAuthLinks,
    unlinkOAuthProvider: oauth.unlinkOAuthProvider,
    reapInactiveAccounts: reapInactive.reapInactiveAccounts,
    reencryptTotpSecrets: reencrypt.reencryptTotpSecrets,
    sendAccountMail: mail.sendAccountMail
};

/**
 * Two-factor authentication: enrollment, removal, backup codes, and the login-time
 * challenge/verify pair.
 */
export const twoFactorService = {
    buildLoginChallenge: twoFactorChallenge.buildLoginChallenge,
    twoFactorStatus: twoFactorEnrollment.twoFactorStatus,
    setupTwoFactorMethod: twoFactorEnrollment.setupTwoFactorMethod,
    sendMethodCode: twoFactorEnrollment.sendMethodCode,
    confirmTwoFactorMethod: twoFactorEnrollment.confirmTwoFactorMethod,
    removeTwoFactorMethod: twoFactorEnrollment.removeTwoFactorMethod,
    disableTwoFactor: twoFactorEnrollment.disableTwoFactor,
    regenerateBackupCodes: twoFactorEnrollment.regenerateBackupCodes,
    sendLoginCode: twoFactorChallenge.sendLoginCode,
    verifyLoginChallenge: twoFactorChallenge.verifyLoginChallenge
};
