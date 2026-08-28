/**
 * Account service — authentication, the profile a person manages, and their address book.
 *
 * A folder rather than one file because it passed ~300 lines; see `docs/theory/layers.md`. The
 * split is by what the operations DO, which is why the address book joined it rather than staying
 * a second service beside it: `addresses-service.ts` at the module root was the same layer under a
 * different naming scheme, and a caller had to know which of two objects held the function it
 * wanted.
 *
 * | file               | what is in it                                                    |
 * | ------------------ | ---------------------------------------------------------------- |
 * | `authentication.ts`| signup, login, and the token writes every session flow goes through |
 * | `profile.ts`       | the caller's own fields, and every path that writes a password   |
 * | `addresses.ts`     | the address book — the one collection this module owns           |
 * | `verification.ts`  | issuing an email-verification token and the mail that carries it |
 * | `tokens.ts`        | the `tokens` array: what makes one live, spending it, listing sessions |
 * | `token-cleanup.ts` | dropping expired tokens; housekeeping two controllers trigger    |
 *
 * `../session/` is the layer below this one: JWT signing, the refresh cookie, and the expiry
 * config they both read. Nothing outside this module imports either — see `../index`.
 */

import {
    tokenAdd,
    signup,
    login,
    tokenRemoveAll,
    requestAccountDeletion,
    requestPasswordReset,
    sessionRevoke,
    logoutCurrentSession,
    refreshAccessToken
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

/*
 * Published by name as well as through the namespace, because something reaches for the function
 * rather than for the service: controllers send the verification mail and trigger the cleanup job,
 * `post-verify-confirm` compares against the token type, `auth-surface.test.ts` pins
 * `addressForCheckout` to the binding `../index` republishes, and the unit suites drive the auth
 * and password flows straight off this module.
 *
 * What is NOT here is the address-book CRUD and `tokenRemoveAll`: nothing imports them by name, so
 * a second list carrying them said the same thing as `accountService` twice — and a name living in
 * two lists can fall out of one of them without a single caller noticing.
 */
export { tokenAdd, signup, login, PASSWORD_RESET_TOKEN_TYPE } from './authentication';
export { passwordChange, passwordChangeWithCurrent, updateProfile } from './profile';
export { addressForCheckout } from './addresses';
export { sendVerificationEmail, EMAIL_VERIFY_TOKEN_TYPE } from './verification';
export { runTokenCleanup } from './token-cleanup';

/**
 * The one namespace this module's service is reached through.
 *
 * Named for the module, not for a slice of it. A name like `authService` describes one of the
 * things this folder does, and every other thing it does then has nowhere to belong. Every module
 * exports exactly one `<something>Service`, and `tests/cross-cutting/service-namespaces.test.ts`
 * fails the build if one does not.
 *
 * It carries EVERY function this folder exports, including the two side-effecting jobs
 * (`sendVerificationEmail`, `runTokenCleanup`). "A job is not an operation on the account" is a
 * distinction the caller cannot see and the guard cannot check, so it is not one this namespace
 * makes. A namespace with a judgement call in it is a namespace that quietly loses
 * members.
 */
export const accountService = {
    tokenAdd,
    signup,
    login,
    tokenRemoveAll,
    requestAccountDeletion,
    requestPasswordReset,
    sessionRevoke,
    logoutCurrentSession,
    refreshAccessToken,
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
    adminTokenCleanup
};
