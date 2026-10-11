/**
 * @module
 * "May this account authenticate?" as one specification: a Mongo filter for the lookups and the
 * predicate for a document already in hand. They answer alike on every state, so a path that
 * queries and a path that checks cannot disagree about a banned or soft-deleted account.
 */

import type { UserDocument } from './model';

/**
 * The clause every login-adjacent lookup filters on. `{ $ne: false }` rather than `true`: a
 * document carrying no `active` field is enabled, and must not be locked out by its absence.
 * `deletedAt: null` is spelled out (it matches both a missing and a null field) instead of
 * `undefined`, whose meaning rests on a driver default.
 */
export const AUTHENTICATABLE_FILTER = { active: { $ne: false }, deletedAt: null } as const;

/**
 * The predicate twin of {@link AUTHENTICATABLE_FILTER}, for an account loaded without that filter
 * (a refresh, a mint, an OAuth match by address).
 *
 * @param user - the loaded account
 * @returns whether it is enabled and not soft-deleted
 */
export const isAuthenticatable = (user: Pick<UserDocument, 'active' | 'deletedAt'>): boolean =>
    user.active !== false && !user.deletedAt;
