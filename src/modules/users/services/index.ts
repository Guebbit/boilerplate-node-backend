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

import { presentUser, presentUserWithCurrentRole, userActionsFor } from '../presenter';
import { validateData } from './validation';
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
    findByToken,
    findByTokenValue,
    emailTaken
} from './lookups';
import {
    setPassword,
    markEmailVerified,
    applyEmailChange,
    restorePreviousEmail,
    cancelPendingEmail,
    markInactivityWarned,
    persistTwoFactorMethods,
    persistReauthCode,
    reserveMfaAttempt,
    resetMfaAttempts,
    claimTotpStep,
    bumpSessionEpoch
} from './credentials';
import {
    consumeToken,
    tokenAdd,
    tokenRemoveAll,
    sessionRemove,
    tokenRemoveByValue,
    tokenRemoveExpired,
    tokenSupersede,
    tokenTouch
} from './tokens';
import {
    registerSelfService,
    registerFromOAuth,
    buildSignupDecoy,
    discardFailedSignup,
    linkOAuthAccount
} from './signup';
import {
    findInactiveUnwarned,
    findWarnedStillInactive,
    findReaperSoftDeletedPastGrace
} from './reaper';

/*
 * The names below are published as well as carried by `userService`: the suites drive the
 * operations directly, and the barrel's surface must not shrink when a file moves.
 */
export { validateData } from './validation';
export { search, getById, findByEmail } from './read';
export { enqueueIfPending } from './image';
export { create } from './create';
export { update, updateById } from './update';
export { remove, restoreById, removeById } from './remove';
export { consumeToken } from './tokens';
export { MFA_MAX_FAILURES, MFA_LOCK_MS } from './credentials';

/** The service's public surface — the controllers call through this, never the bare functions. */
export const userService = {
    validateData,
    search,
    getById,
    create,
    registerSelfService,
    registerFromOAuth,
    buildSignupDecoy,
    discardFailedSignup,
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
    findByToken,
    findByTokenValue,
    setPassword,
    markEmailVerified,
    applyEmailChange,
    restorePreviousEmail,
    cancelPendingEmail,
    markInactivityWarned,
    persistTwoFactorMethods,
    persistReauthCode,
    reserveMfaAttempt,
    resetMfaAttempts,
    claimTotpStep,
    bumpSessionEpoch,
    tokenAdd,
    tokenRemoveAll,
    sessionRemove,
    tokenRemoveByValue,
    tokenRemoveExpired,
    tokenSupersede,
    tokenTouch,
    linkOAuthAccount,
    findInactiveUnwarned,
    findWarnedStillInactive,
    findReaperSoftDeletedPastGrace,
    consumeToken,
    enqueueIfPending,
    // A controller may not reach `./presenter` directly (the persistence wall), so the shaping
    // helper it needs to build a response rides through the service instead.
    toUser: presentUser,
    toUserContract: presentUserWithCurrentRole,
    userActionsFor
};
