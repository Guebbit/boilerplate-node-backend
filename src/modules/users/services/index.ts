/**
 * @module
 * User service — the User document's admin CRUD and search, plus the named identity operations
 * `account` calls to authenticate, register, verify and 2FA-protect it: the `users` end of the one
 * domain-primitives relationship in this repo (`docs/theory/strategic-ddd.md` §5). One file per
 * flow, not one big file; see `docs/theory/layers.md`.
 *
 * The flows themselves — HTTP, sessions, emails, rate limits, anti-automation — stay in `account`;
 * these files only ever enforce what the document itself requires.
 *
 * See: docs/modules/users.md
 */

import { presentAccount } from '../presenter';
import { search, getById, findByEmail, toUserContract, toUserContracts } from './read';
import { activate, deactivate } from './activation';
import { enqueueIfPending } from './image';
import { create } from './create';
import { updateById } from './update';
import { restoreById, removeById } from './remove';
import {
    purchaseHoldOf,
    purchaseHoldCountingSince,
    setPurchaseHold,
    liftPurchaseHold,
    takeAutomaticPurchaseHold,
    flagPurchaseHoldReview
} from './purchase-hold';
import {
    updateOwnProfile,
    redeemedOwner,
    eraseOwnAccount,
    softDeleteInactive,
    eraseInactive,
    scheduleOwnDeletion,
    restoreOwnAccount,
    eraseScheduledDeletion,
    findDueScheduledDeletions
} from './own-account';
import {
    findAuthenticatableById,
    findByIdWithCredentials,
    findForLogin,
    findByOAuthIdentity,
    findByIdWithPendingEmail,
    emailOrPendingEmailTaken,
    emailTaken
} from './lookups';
import {
    setPassword,
    markSessionsEnded,
    markEmailVerified,
    applyEmailChange,
    restorePreviousEmail,
    cancelPendingEmail,
    markInactivityWarned,
    persistTwoFactorMethods,
    persistTwoFactorWrite,
    armReauthCode,
    spendDeliveredCode,
    recordDeliveredMiss,
    reserveMfaAttempt,
    resetMfaAttempts,
    claimTotpStep,
    spendBackupCode,
    bumpSessionEpoch,
    touchLastActive,
    touchApiKeyUse
} from './credentials';
import { clearLapsedPreviousEmail, clearDeliveredCode } from './credentials';
import { reencryptUserPhones, reencryptTwoFactorSecrets } from './reencrypt';
import { exportSignInMethods } from './sign-in-methods';
import { userAuditChanges } from './audit-changes';
import {
    registerSelfService,
    registerFromOAuth,
    buildSignupDecoy,
    linkOAuthAccount,
    unlinkOAuthAccount
} from './signup';
import {
    findInactiveUnwarned,
    findInactiveUnminimised,
    minimiseInactive,
    minimiseInactiveBefore,
    findWarnedStillInactive,
    findReaperSoftDeletedPastGrace
} from './reaper';

export { isAuthenticatable, isRestorable } from '../authenticatable';
export type { TwoFactorSecretRing } from './reencrypt';
export type { RedeemedOwner } from './own-account';
export type { ActivePurchaseHold } from './purchase-hold';

/**
 * The service's public surface — the controllers call through this, never the bare functions.
 * `updateById`, `activate`, `deactivate` and `removeById` load by id and ask the staff-role question first. The four
 * named doors take an already-loaded document for the one caller that holds the record and the
 * right to change it: the owner (`updateOwnProfile`, and `eraseOwnAccount`, which asks for the spent deletion link's proof, `redeemedOwner`) and the inactivity reaper
 * (`softDeleteInactive`, `eraseInactive`). The raw `update` and `remove` beneath them are not here.
 */
export const userService = {
    userAuditChanges,
    search,
    getById,
    create,
    registerSelfService,
    registerFromOAuth,
    buildSignupDecoy,
    updateById,
    activate,
    deactivate,
    removeById,
    restoreById,
    purchaseHoldOf,
    purchaseHoldCountingSince,
    setPurchaseHold,
    liftPurchaseHold,
    takeAutomaticPurchaseHold,
    flagPurchaseHoldReview,
    updateOwnProfile,
    redeemedOwner,
    eraseOwnAccount,
    softDeleteInactive,
    eraseInactive,
    scheduleOwnDeletion,
    restoreOwnAccount,
    eraseScheduledDeletion,
    findDueScheduledDeletions,
    findByEmail,
    emailTaken,
    findAuthenticatableById,
    findByIdWithCredentials,
    findForLogin,
    findByOAuthIdentity,
    findByIdWithPendingEmail,
    emailOrPendingEmailTaken,
    exportSignInMethods,
    setPassword,
    markSessionsEnded,
    markEmailVerified,
    applyEmailChange,
    restorePreviousEmail,
    cancelPendingEmail,
    markInactivityWarned,
    persistTwoFactorMethods,
    persistTwoFactorWrite,
    armReauthCode,
    spendDeliveredCode,
    recordDeliveredMiss,
    reserveMfaAttempt,
    resetMfaAttempts,
    claimTotpStep,
    spendBackupCode,
    bumpSessionEpoch,
    touchLastActive,
    touchApiKeyUse,
    clearLapsedPreviousEmail,
    clearDeliveredCode,
    reencryptUserPhones,
    reencryptTwoFactorSecrets,
    linkOAuthAccount,
    unlinkOAuthAccount,
    findInactiveUnwarned,
    findInactiveUnminimised,
    minimiseInactive,
    minimiseInactiveBefore,
    findWarnedStillInactive,
    findReaperSoftDeletedPastGrace,
    enqueueIfPending,
    // The barrel never publishes a presenter function, so a sibling that has to shape an account
    // for a response reaches the helper through the service.
    toAccount: presentAccount,
    toUserContract,
    toUserContracts
};
