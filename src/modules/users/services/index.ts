/**
 * @module
 * User service — the User document's admin CRUD and search, plus the named identity operations
 * `account` calls to authenticate, register, verify and 2FA-protect it: the `users` end of the one
 * shared-kernel relationship in this repo (`docs/theory/strategic-ddd.md` §5). A folder rather
 * than one file because it passed ~900 lines; see `docs/theory/layers.md`.
 *
 * The flows themselves — HTTP, sessions, emails, rate limits, anti-automation — stay in `account`;
 * these files only ever enforce what the document itself requires.
 *
 * See: docs/modules/users.md
 */

import {
    presentUser,
    presentUserWithCurrentRole,
    presentUsersWithCurrentRoles,
    userActionsFor
} from '../presenter';
import { search, getById, findByEmail } from './read';
import { enqueueIfPending } from './image';
import { create } from './create';
import { update, updateById } from './update';
import { remove, restoreById, removeById } from './remove';
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

export { isAuthenticatable } from '../authenticatable';
export type { TwoFactorSecretRing } from './reencrypt';

/**
 * The service's public surface — the controllers call through this, never the bare functions.
 * `update` and `remove` take an already-loaded document and skip the rank check, for the trusted
 * callers that hold the record and the right to change it; `updateById` and `removeById` load by
 * id and ask first.
 */
export const userService = {
    search,
    getById,
    create,
    registerSelfService,
    registerFromOAuth,
    buildSignupDecoy,
    update,
    updateById,
    remove,
    removeById,
    restoreById,
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
    // A controller may not reach `./presenter` directly (the persistence wall), so the shaping
    // helper it needs to build a response rides through the service instead.
    toUser: presentUser,
    toUserContract: presentUserWithCurrentRole,
    toUserContracts: presentUsersWithCurrentRoles,
    userActionsFor
};
