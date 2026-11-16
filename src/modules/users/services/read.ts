/**
 * @module
 * Admin search and single-document reads.
 */

import type { Caller, SearchUsersRequest, User, UserListItem } from '@types';
import type { PaginatedMeta } from '@infrastructure/persistence/search';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { getDefaultLocale } from '@infrastructure/i18n';
import { accessService } from '@modules/access';
import type { UserDocument, UserWire } from '../model';
import { presentUser, presentUserListItem } from '../presenter';
import { userRepository } from '../repository';
import { userActionsFor } from './actions';

/**
 * The scope a search adds for the two purchase-hold questions, or none.
 *
 * @param filters - the search the caller asked for
 */
const searchScopeOf = (
    filters: Pick<SearchUsersRequest, 'purchaseHold' | 'purchaseHoldReview'>
): Record<string, unknown> | undefined => {
    const scope = {
        ...(filters.purchaseHold ? { 'purchaseHold.until': { $gt: new Date() } } : {}),
        ...(filters.purchaseHoldReview ? { purchaseHoldFlaggedAt: { $exists: true } } : {})
    };
    return Object.keys(scope).length === 0 ? undefined : scope;
};

/**
 * Search users (DTO-friendly) — admin panel. No scope argument: `active` is an ordinary
 * searchable column, handled by the repository's `searchable.booleans` like any other filter,
 * independent of `deletedAt`.
 */
export const search = (
    filters: SearchUsersRequest = {}
): Promise<{
    items: UserWire[];
    meta: PaginatedMeta;
}> =>
    /**
     * `purchaseHold: true` is a question about NOW (an expired hold is not a hold), which a stored
     * column filter cannot ask, so it rides in as the repository's scope. `purchaseHoldReview: true`
     * asks whether the flag is still there, whatever became of the hold; the two combine.
     */
    userRepository.search(filters, searchScopeOf(filters));

/** Get a single user by ID. Returns undefined when no id is provided. */
export const getById = (id?: string): Promise<UserDocument | undefined> => {
    if (!id) return Promise.resolve(undefined);
    return userRepository.findById(id).then((user) => user ?? undefined);
};

/** One staff member a notice can reach: where to mail them and in which language. */
export interface StaffContact {
    id: string;
    email: string;
    locale: string;
}

/**
 * Narrow candidate staff to the ones who can act on a notice: live, enabled and with an
 * authenticator app armed (without one their staff role is withheld, so they could not do what the
 * notice asks). Anyone else is silently left out.
 *
 * @param ids - account ids, typically the members who hold the permission set a notice is for
 */
export const staffContacts = (ids: readonly string[]): Promise<StaffContact[]> =>
    ids.length === 0
        ? Promise.resolve([])
        : userRepository.findStaffContacts(ids).then((users) =>
              users.map((user) => ({
                  id: String(user._id),
                  email: user.email,
                  locale: user.locale ?? getDefaultLocale()
              }))
          );

/**
 * The contract `User` for an already-loaded document: resolves its CURRENT role fresh from the
 * membership store (the document holds none of its own), asks whether it holds a staff role, and
 * hands both to the presenter with the finished `actions`. The list rows are
 * {@link toUserListItems}, a smaller shape.
 *
 * @param user - the account
 * @param caller - `request.caller`, so the row says what that caller may do to it
 */
export const toUserContract = (user: UserDocument, caller: Caller): Promise<User> =>
    accessService
        .rolesOf(String(user._id), DEPLOYMENT_TENANT_ID)
        .then((roles) =>
            presentUser(
                user,
                roles.tenant,
                userActionsFor(
                    user,
                    roles.tenant !== null || roles.platform !== null,
                    roles.tenant !== null,
                    caller
                )
            )
        );

/**
 * The staff list's rows for a whole page of already-loaded accounts: the roles in one `$in` query
 * and who holds a staff role in two more, never a lookup per row. Takes {@link UserWire} — the
 * lean, already-normalised rows `search()` returns. A row is a {@link UserListItem}, not a `User`:
 * the list carries what its table shows, and the rest of the record is the audited detail read's.
 *
 * @param rows - the page's accounts
 * @param caller - `request.caller`, so each row says what that caller may do to it
 */
export const toUserListItems = (
    rows: readonly UserWire[],
    caller: Caller
): Promise<UserListItem[]> => {
    const ids = rows.map((user) => user.id);

    return Promise.all([
        accessService.rolesOfMany(ids, DEPLOYMENT_TENANT_ID),
        accessService.staffHoldersAmong(ids)
    ]).then(([roles, staff]) =>
        rows.map((user) =>
            presentUserListItem(
                user,
                roles.get(user.id) ?? null,
                userActionsFor(
                    user,
                    staff.has(user.id),
                    (roles.get(user.id) ?? null) !== null,
                    caller
                )
            )
        )
    );
};

/**
 * Find a user by email address.
 * Returns the document, or `null` when no account has the address.
 */
export const findByEmail = (email: string): Promise<UserDocument | undefined | null> =>
    /**
     * Credentials included: the callers (reset-request, setup-request) immediately push a
     * token onto the document, which `select: false` would otherwise leave undefined.
     */
    userRepository.findOneWithCredentials({ email });
