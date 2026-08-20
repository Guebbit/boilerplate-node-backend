/**
 * The one authorization rule two domains share: *yours, or you are staff*.
 *
 * `orders` and `payments` both restrict a read to the caller's own rows, and both did it with the
 * same five lines — the same `undefined` for admins, the same `?? ''`, the same paragraph of
 * docblock explaining why. Two copies of an authorization rule is two places for it to drift, and
 * the drift is silent: widening a scope does not fail a test, it just returns more rows.
 *
 * Lives in the kernel next to `authentication.ts` and `middlewares/authorizations.ts`, which own
 * the other half of the same question — those decide WHO the caller is and whether they may reach
 * the route, this decides which ROWS they may see once they have. The scope builder arrives as an
 * argument rather than an import, which is what keeps the kernel from naming a module.
 */

import type { Caller } from '@types';

/** A filter fragment restricting a query to one user's rows, or `undefined` for no restriction. */
export type Scope = Record<string, unknown> | undefined;

/**
 * Build a module's `callerScope` from its repository's owner scope.
 *
 * The returned function answers "which rows may this caller read" as a filter fragment that the
 * caller SPREADS into a query (`{ ...callerScope(ctx), status: 'paid' }`) rather than treats as a
 * filter in its own right — `undefined` means "no restriction", not "match nothing".
 *
 * The restriction has to ride IN the read. Fetching a row and then checking its owner is what
 * `orders/repository.ts` names as the way a scoped find turns into a leak: it opens a window
 * between the check and whatever uses the document, and it lets "not yours" and "does not exist"
 * answer differently.
 *
 * The `?? ''` is deliberate and load-bearing. A caller with no id yields an empty string, which is
 * not a valid ObjectId, so `ownerScopeOf` throws. That is the safe direction — the alternative is
 * omitting the owner clause, which does not fail anything and quietly widens the query to every
 * user's data. A bug here becomes a 500, never a disclosure.
 *
 * @param ownerScopeOf - the repository's owner scope, e.g. `orderRepository.visibleScope`. Must
 *   throw on an empty id rather than return an empty fragment, or the fail-closed property above
 *   is lost.
 * @returns the module's `callerScope`
 */
export const createCallerScope =
    (ownerScopeOf: (userId: string) => Record<string, unknown>) =>
    (caller?: Caller): Scope =>
        caller?.admin ? undefined : ownerScopeOf(caller?.id ?? '');
