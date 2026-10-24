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

/**
 * Whether an account locked by its owner's own deletion can still be brought back: scheduled by the
 * owner, grace not yet run out, and not banned. A banned account stays refused whatever it
 * scheduled, and one past `purgeAt` waits only for the purge job.
 *
 * @param user - the loaded account
 * @param now - the moment to judge against
 * @returns whether restoring it is still on offer
 */
export const isRestorable = (
    user: Pick<UserDocument, 'active' | 'deletedBy' | 'purgeAt'>,
    now: Date = new Date()
): boolean =>
    user.active !== false && user.deletedBy === 'owner' && !!user.purgeAt && user.purgeAt > now;
