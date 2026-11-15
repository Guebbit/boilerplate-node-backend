/**
 * @module
 * User service — the User document's admin CRUD and search, and the few reads and holds a sibling
 * module really uses. The rest of what touches the document (authenticate, register, verify,
 * 2FA-protect, erase) is `account`'s and lives behind `../friends/account.ts`. One file per flow,
 * not one big file; see `docs/understand/layers.md`.
 *
 * The flows themselves — HTTP, sessions, emails, rate limits, anti-automation — stay in `account`;
 * these files only ever enforce what the document itself requires.
 *
 * @see docs/modules/users.md
 */

import { presentAccount } from '../presenter';
import { search, getById, staffContacts, toUserContract, toUserListItems } from './read';
import { activate, deactivate } from './activation';
import { create } from './create';
import { updateById } from './update';
import { assignUserRole, revokeUserRole } from './role';
import { restoreById, removeById } from './remove';
import {
    purchaseHoldOf,
    purchaseHoldCountingSince,
    setPurchaseHold,
    liftPurchaseHold,
    flagPurchaseHoldReview
} from './purchase-hold';
import { findAuthenticatableById } from './lookups';
import { touchApiKeyUse } from './credentials';

export { isAuthenticatable, isRestorable } from '../authenticatable';
export { personalDataSubjectOf } from './personal-data-subject';
// The privacy-notice link: `account`'s setup mail is a person's first contact (GDPR Art. 14(3)(b)).
export { privacyFrontendLink } from '../config';
export type { TwoFactorSecretRing } from './reencrypt';
export type { ActivePurchaseHold } from './purchase-hold';
export type { StaffContact } from './read';

/**
 * The service's public surface — the controllers call through this, never the bare functions.
 * `updateById`, `activate`, `deactivate` and `removeById` load by id and ask the staff-role question first;
 * `assignUserRole` and `revokeUserRole` are the role door and ask the grant itself. What `account`
 * alone calls (credentials, sign-up, the owner's own doors, the reaper) is `accountUserService`
 * in `../friends/account.ts`, not here: a sibling cannot reach a step that trusts its caller.
 */
export const userService = {
    search,
    getById,
    staffContacts,
    create,
    updateById,
    assignUserRole,
    revokeUserRole,
    activate,
    deactivate,
    removeById,
    restoreById,
    purchaseHoldOf,
    purchaseHoldCountingSince,
    setPurchaseHold,
    liftPurchaseHold,
    flagPurchaseHoldReview,
    findAuthenticatableById,
    touchApiKeyUse,
    // The barrel never publishes a presenter function, so a sibling that has to shape an account
    // for a response reaches the helper through the service.
    toAccount: presentAccount,
    toUserContract,
    toUserListItems
};
