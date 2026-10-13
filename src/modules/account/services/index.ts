/**
 * @module
 * Account service — authentication, the profile a person manages, and two-factor. A folder rather
 * than one file because it passed ~300 lines, one file per flow — see `docs/theory/layers.md`.
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
 * `./export` and `./export-job` are NOT imported here, on purpose: they are this module's own
 * wiring (queue, file store, mail budget), and no sibling has a use for them. The export reaches
 * no sibling's data either — every module declares its own `personalData` section, and
 * `../module.ts` hands the resolved list in. The export controllers and `../module.ts` import the
 * two files directly. `./export-rows` (the reaper) reaches nothing but this module's own store,
 * so it is published.
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

/*
 * Published by name as well as on the namespace, for the callers that import a single function
 * rather than the object — controllers, and the suites that pin one flow. Unused-by-name is
 * allowed on purpose, same as the module barrel itself (CLAUDE.md's "Module barrels"): a caller
 * reaching for a name not listed here copies the logic instead of adding the export it needed.
 */
export { PASSWORD_RESET_TOKEN_TYPE, ACCOUNT_DELETE_TOKEN_TYPE } from '../token-types';
export { RESET_REQUEST_SECONDS } from './password-reset-request';
export { amrAfterReauth } from './reauth';
export { passwordChangeWithCurrent } from './password';
export { updateProfile } from './profile';
export {
    sendVerificationEmail,
    EMAIL_VERIFY_TOKEN_TYPE,
    EMAIL_CHANGE_TOKEN_TYPE,
    VERIFY_RESEND_SECONDS,
    completeEmailChange,
    undoEmailChange
} from './verification';
export { EMAIL_CHANGE_UNDO_TOKEN_TYPE } from '../token-types';
export { reapLapsedPreviousEmails } from './previous-email-cleanup';
export { reapExpiredExports } from './export-rows';
export { reencryptTotpSecrets } from './reencrypt';
export { sendAccountMail } from './mail';
export {
    loginOrCreateFromOAuth,
    recordOAuthFailure,
    OAuthEmailUnverifiedError,
    OAuthAccountUnverifiedError,
    OAuthAccountUnavailableError
} from './oauth';

/**
 * Core account functions: login, signup, profile, verification, sessions and one-time tokens, the
 * previous-email sweep, OAuth. Two-factor gets its own namespace below. The address book is
 * `@modules/addresses`, a separate module entirely; data export is `./export`, deliberately not
 * part of this object — see this file's own docblock above.
 */
export const accountService = {
    issueToken: tokens.issueToken,
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
    passwordChange: password.passwordChange,
    passwordChangeWithCurrent: password.passwordChangeWithCurrent,
    passwordResetChange: passwordReset.passwordResetChange,
    completePasswordReset: passwordReset.completePasswordReset,
    updateProfile: profile.updateProfile,
    cancelPendingEmailChange: emailChange.cancelPendingEmailChange,
    getOwnProfile: profile.getOwnProfile,
    removeOwnAccount: selfDelete.removeOwnAccount,
    sendVerificationEmail: verification.sendVerificationEmail,
    requestEmailVerification: verification.requestEmailVerification,
    requestEmailVerificationFor: verification.requestEmailVerificationFor,
    resendPendingEmailVerificationFor: verification.resendPendingEmailVerificationFor,
    completeEmailVerification: verification.completeEmailVerification,
    completeEmailChange: verification.completeEmailChange,
    undoEmailChange: verification.undoEmailChange,
    findLiveToken: tokens.findLiveToken,
    spendLiveToken: tokens.spendLiveToken,
    redeemLiveToken: tokens.redeemLiveToken,
    recordOneTimeTokenRejected: tokens.recordOneTimeTokenRejected,
    sessionsList: sessions.sessionsList,
    reapLapsedPreviousEmails: previousEmailCleanup.reapLapsedPreviousEmails,
    reapExpiredExports: exportRows.reapExpiredExports,
    loginOrCreateFromOAuth: oauth.loginOrCreateFromOAuth,
    recordOAuthFailure: oauth.recordOAuthFailure,
    listOAuthLinks: oauth.listOAuthLinks,
    unlinkOAuthProvider: oauth.unlinkOAuthProvider
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
