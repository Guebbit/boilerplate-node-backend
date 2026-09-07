/**
 * @module
 * Account service — authentication, the profile a person manages, two-factor, and the address
 * book. A folder rather than one file because it passed ~300 lines (see `docs/theory/layers.md`),
 * split by what each operation does. `../session/` sits below this layer (JWT signing, the
 * refresh cookie, shared expiry) and nothing outside this module imports it directly; see
 * `../index`.
 *
 * Three namespaces, not one: `accountService` (login, signup, profile, verification, tokens,
 * export, OAuth), `twoFactorService` (enrollment, removal, challenge/verify) and `addressService`
 * (the address book's CRUD). A caller of `accountService.login` was, to TypeScript, coupled to
 * 2FA and the address book too when all 44 functions lived on one object — splitting along the
 * same file boundaries below removes that coupling without adding new ones. Prefer importing the
 * one function you need directly from its file over any of these three when a caller needs only
 * one or two names; the namespaces exist so the module's surface can still be browsed by name.
 */

import {
    tokenAdd,
    signup,
    login,
    tokenRemoveAll,
    requestAccountDeletion,
    requestPasswordReset,
    requestAccountSetup,
    sessionRevoke,
    logoutCurrentSession,
    refreshAccessToken,
    reauth
} from './authentication';
import {
    validatePasswordChange,
    passwordChange,
    passwordChangeWithCurrent,
    passwordResetChange,
    updateProfile,
    getOwnProfile,
    removeOwnAccount
} from './profile';
import {
    sendVerificationEmail,
    requestEmailVerification,
    requestEmailVerificationFor,
    completeEmailVerification,
    completeEmailChange
} from './verification';
import { findLiveToken, spendLiveToken, sessionsList } from './tokens';
import { runTokenCleanup, adminTokenCleanup } from './token-cleanup';
import { exportOwnData } from './export';
import { loginOrCreateFromOAuth, recordOAuthFailure } from './oauth';
import {
    buildLoginChallenge,
    confirmTwoFactorMethod,
    disableTwoFactor,
    regenerateBackupCodes,
    removeTwoFactorMethod,
    sendLoginCode,
    setupTwoFactorMethod,
    twoFactorStatus,
    verifyLoginChallenge
} from './two-factor';
import {
    addressesGet,
    addressAdd,
    addressUpdate,
    addressRemove,
    addressForCheckout,
    addressesDeleteByUserId
} from './addresses';

/*
 * Published by name as well as through the namespace: several callers reach for the function
 * directly (controllers, `post-verify-confirm`, `auth-surface.test.ts`, the unit suites).
 * `tokenRemoveAll` stays out of this list — nothing imports it by name, so a second list would
 * just be a name that could quietly drift from `accountService`.
 */
export {
    tokenAdd,
    signup,
    login,
    wasRefusedByEmailPolicy,
    PASSWORD_RESET_TOKEN_TYPE
} from './authentication';
export { passwordChange, passwordChangeWithCurrent, updateProfile } from './profile';
export {
    sendVerificationEmail,
    EMAIL_VERIFY_TOKEN_TYPE,
    EMAIL_CHANGE_TOKEN_TYPE,
    completeEmailChange
} from './verification';
export { runTokenCleanup } from './token-cleanup';
export { loginOrCreateFromOAuth, recordOAuthFailure, OAuthEmailUnverifiedError } from './oauth';
export { addressForCheckout } from './addresses';

/**
 * Core account functions: login, signup, profile, verification, session tokens, the
 * token-cleanup job, data export, OAuth. Everything except two-factor and the address book, which
 * get their own namespace below.
 */
export const accountService = {
    tokenAdd,
    signup,
    login,
    tokenRemoveAll,
    requestAccountDeletion,
    requestPasswordReset,
    requestAccountSetup,
    sessionRevoke,
    logoutCurrentSession,
    refreshAccessToken,
    reauth,
    validatePasswordChange,
    passwordChange,
    passwordChangeWithCurrent,
    passwordResetChange,
    updateProfile,
    getOwnProfile,
    removeOwnAccount,
    sendVerificationEmail,
    requestEmailVerification,
    requestEmailVerificationFor,
    completeEmailVerification,
    completeEmailChange,
    findLiveToken,
    spendLiveToken,
    sessionsList,
    runTokenCleanup,
    adminTokenCleanup,
    exportOwnData,
    loginOrCreateFromOAuth,
    recordOAuthFailure
};

/**
 * Two-factor authentication: enrollment, removal, backup codes, and the login-time
 * challenge/verify pair.
 */
export const twoFactorService = {
    buildLoginChallenge,
    twoFactorStatus,
    setupTwoFactorMethod,
    confirmTwoFactorMethod,
    removeTwoFactorMethod,
    disableTwoFactor,
    regenerateBackupCodes,
    sendLoginCode,
    verifyLoginChallenge
};

/**
 * The address book: list, add, update, remove, and the two cross-cutting reads (checkout's
 * lookup, the cascade delete when a user account goes away).
 */
export const addressService = {
    addressesGet,
    addressAdd,
    addressUpdate,
    addressRemove,
    addressForCheckout,
    addressesDeleteByUserId
};
