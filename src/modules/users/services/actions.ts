/**
 * @module
 * What one caller may do to one account: the `User.actions` block. Each flag is the route's key,
 * the protection of staff accounts (`access`'s `mayChangeAccount`) and the account's own state, so
 * a client never offers a move the server would refuse. The presenter only maps the finished block.
 *
 * See: docs/modules/users.md#actions
 */

import type { Caller, UserActions } from '@types';
import { heldRules } from '@kernel/ability';
import { mayChangeAccount } from '@modules/access';
import type { UserWire } from '../model';
import { hasPurchaseHoldToClear } from './purchase-hold';

/**
 * The part of an account {@link userActionsFor} reads: its identity and the facts its flags
 * depend on.
 */
export type ActionsSubject = Pick<
    UserWire,
    'id' | 'active' | 'deletedAt' | 'purchaseHold' | 'purchaseHoldFlaggedAt'
>;

/**
 * Pure: no lookup, no I/O. The two lookups it needs (does the owner hold a staff role, what are the
 * caller's keys) are made once per request or per page by the caller of this function.
 *
 * Ban-class flags (hold, lift, activate, deactivate) all ride on `ban:User`: an inactive account is
 * a ban today, and support keeps no `ban:User`.
 *
 * @param user - the account being described
 * @param ownerHoldsRole - whether it holds a staff role, in the shop or over the installation
 * @param caller - `request.caller`
 */
export const userActionsFor = (
    user: ActionsSubject,
    ownerHoldsRole: boolean,
    caller: Caller
): UserActions => {
    const held = heldRules(caller);
    const holdsAssignRole = held.has('assign:Role');
    const reachable = mayChangeAccount(
        { id: caller.id, holdsAssignRole },
        { id: user.id, holdsStaffRole: ownerHoldsRole }
    );
    const mayUpdate = reachable && held.has('update:User');
    const mayDelete = reachable && held.has('delete:User');
    const mayBan = reachable && held.has('ban:User');
    const deleted = user.deletedAt !== undefined;
    const active = user.active ?? true;

    return {
        update: mayUpdate,
        assignRole: mayUpdate && holdsAssignRole,
        delete: mayDelete && !deleted,
        hardDelete: mayDelete,
        restore: mayDelete && deleted,
        setPurchaseHold: mayBan,
        liftPurchaseHold: mayBan && hasPurchaseHoldToClear(user),
        activate: mayBan && !active,
        deactivate: mayBan && active
    };
};
