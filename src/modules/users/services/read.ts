/**
 * @module
 * Admin search and single-document reads.
 */

import type { SearchUsersRequest } from '@types';
import type { PaginatedMeta } from '@infrastructure/persistence/search';
import type { UserDocument, UserWire } from '../model';
import { userRepository } from '../repository';

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
    // `purchaseHold: true` is a question about NOW (an expired hold is not a hold), which a stored
    // column filter cannot ask, so it rides in as the repository's scope. `purchaseHoldReview: true`
    // asks whether the flag is still there, whatever became of the hold; the two combine.
    userRepository.search(filters, searchScopeOf(filters));

/** Get a single user by ID. Returns undefined when no id is provided. */
export const getById = (id?: string): Promise<UserDocument | undefined> => {
    if (!id) return Promise.resolve(undefined);
    return userRepository.findById(id).then((user) => user ?? undefined);
};

/**
 * Find a user by email address.
 * Returns the document if found, or undefined if no match.
 */
export const findByEmail = (email: string): Promise<UserDocument | undefined | null> =>
    // Credentials included: both callers (reset-request, delete-request) immediately push a
    // token onto the document, which `select: false` would otherwise leave undefined.
    userRepository.findOneWithCredentials({ email });
