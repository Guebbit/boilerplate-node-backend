/**
 * @module
 * Account service — authentication, the profile a person manages, and their address book. A
 * folder rather than one file because it passed ~300 lines (see `docs/theory/layers.md`), split
 * by what each operation does; the address book joined for the same reason `addresses-service.ts`
 * was retired. `../session/` sits below this layer (JWT signing, the refresh cookie, shared
 * expiry) and nothing outside this module imports it directly; see `../index`.
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
    addressesGet,
    addressAdd,
    addressUpdate,
    addressRemove,
    addressForCheckout,
    addressesDeleteByUserId
} from './addresses';
import {
    sendVerificationEmail,
    requestEmailVerification,
    requestEmailVerificationFor,
    completeEmailVerification
} from './verification';
import { findLiveToken, spendLiveToken, sessionsList } from './tokens';
import { runTokenCleanup, adminTokenCleanup } from './token-cleanup';
import { exportOwnData } from './export';
import { loginOrCreateFromOAuth, recordOAuthFailure } from './oauth';
import {
    setupTwoFactor,
    confirmTwoFactor,
    disableTwoFactor,
    verifyLoginChallenge
} from './two-factor';

/*
 * Published by name as well as through the namespace: several callers reach for the function
 * directly (controllers, `post-verify-confirm`, `auth-surface.test.ts`, the unit suites).
 * Address-book CRUD and `tokenRemoveAll` stay out of this list — nothing imports them by name, so
 * a second list would just be a name that could quietly drift from `accountService`.
 */
export { tokenAdd, signup, login, PASSWORD_RESET_TOKEN_TYPE } from './authentication';
export { passwordChange, passwordChangeWithCurrent, updateProfile } from './profile';
export { addressForCheckout } from './addresses';
export { sendVerificationEmail, EMAIL_VERIFY_TOKEN_TYPE } from './verification';
export { runTokenCleanup } from './token-cleanup';
export { loginOrCreateFromOAuth, recordOAuthFailure, OAuthEmailUnverifiedError } from './oauth';

/**
 * The one namespace this module's service is reached through — named for the module, not a
 * slice of it, so every function has somewhere to belong. Carries EVERY exported function,
 * including the side-effecting jobs (`sendVerificationEmail`, `runTokenCleanup`): a namespace
 * with judgement calls in it is one that quietly loses members.
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
    addressesGet,
    addressAdd,
    addressUpdate,
    addressRemove,
    addressForCheckout,
    addressesDeleteByUserId,
    sendVerificationEmail,
    requestEmailVerification,
    requestEmailVerificationFor,
    completeEmailVerification,
    findLiveToken,
    spendLiveToken,
    sessionsList,
    runTokenCleanup,
    adminTokenCleanup,
    exportOwnData,
    setupTwoFactor,
    confirmTwoFactor,
    disableTwoFactor,
    verifyLoginChallenge,
    loginOrCreateFromOAuth,
    recordOAuthFailure
};
