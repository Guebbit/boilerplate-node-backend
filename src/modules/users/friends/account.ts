/**
 * @module
 * The `users` end of the one relationship `account` has with it: every function `account` calls to
 * authenticate, register, verify, 2FA-protect, change and erase the User document.
 *
 * Why `account` is the friend:  it signs people in and owns the account lifecycle, and these
 *                               steps do NO checks of their own; they trust what `account` verified.
 * The shared reads:             `getById`, `findAuthenticatableById` and `toAccount` are the same
 *                               functions as the public `userService`'s, under a second name.
 * Spies:                        a test spies the object the code under test imports, this one.
 * Where it may be imported:     `account` only (lint); `account` may not import `userService`.
 *
 * See: docs/theory/strategic-ddd.md §5, docs/modules/users.md
 */

import { presentAccount } from '../presenter';
import { userAuditChanges } from '../services/audit-changes';
import { getById, findByEmail } from '../services/read';
import { enqueueIfPending } from '../services/image';
import {
    registerSelfService,
    registerFromOAuth,
    buildSignupDecoy,
    linkOAuthAccount,
    unlinkOAuthAccount
} from '../services/signup';
import {
    updateOwnProfile,
    softDeleteInactive,
    eraseInactive,
    scheduleOwnDeletion,
    restoreOwnAccount,
    eraseScheduledDeletion,
    eraseAgain,
    restoreDeletionState,
    findDueScheduledDeletions
} from '../services/own-account';
import {
    findAuthenticatableById,
    findByIdWithCredentials,
    findForLogin,
    findByOAuthIdentity,
    findByIdWithPendingEmail,
    emailOrPendingEmailTaken,
    emailTaken
} from '../services/lookups';
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
    clearLapsedPreviousEmail,
    clearDeliveredCode
} from '../services/credentials';
import { reencryptTwoFactorSecrets } from '../services/reencrypt';
import {
    findInactiveUnwarned,
    minimiseInactiveBefore,
    findWarnedStillInactive,
    findReaperSoftDeletedPastGrace
} from '../services/reaper';

/**
 * Everything `account` calls on the User document. Two separate objects with no spread: a spread
 * copies the functions at load, and `jest.spyOn` on one object would stop reaching the other.
 * @internal Friend-only to `account`: no check beneath these functions, and no barrel may publish them.
 */
export const accountUserService = {
    userAuditChanges,
    getById,
    findByEmail,
    enqueueIfPending,
    registerSelfService,
    registerFromOAuth,
    buildSignupDecoy,
    linkOAuthAccount,
    unlinkOAuthAccount,
    updateOwnProfile,
    softDeleteInactive,
    eraseInactive,
    scheduleOwnDeletion,
    restoreOwnAccount,
    eraseScheduledDeletion,
    eraseAgain,
    restoreDeletionState,
    findDueScheduledDeletions,
    findAuthenticatableById,
    findByIdWithCredentials,
    findForLogin,
    findByOAuthIdentity,
    findByIdWithPendingEmail,
    emailOrPendingEmailTaken,
    emailTaken,
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
    clearLapsedPreviousEmail,
    clearDeliveredCode,
    reencryptTwoFactorSecrets,
    findInactiveUnwarned,
    minimiseInactiveBefore,
    findWarnedStillInactive,
    findReaperSoftDeletedPastGrace,
    // The barrel never publishes a presenter function; the friend reaches the helper through here.
    toAccount: presentAccount
};
