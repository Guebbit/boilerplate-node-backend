/**
 * @module
 * The one authorization rule four domains share: *an admin reads everything, everyone else reads
 * a narrowed slice*. The slice differs — own rows for `orders`/`payments`, published-only for
 * `products`/`locales` — but was written four times identically otherwise, and the drift is
 * silent: a widened scope doesn't fail a test, it just returns more rows. Lives beside
 * `authentication.ts`/`middlewares/authorizations.ts` (WHO the caller is); this decides which ROWS
 * they see. The scope builder arrives as an argument, not an import, keeping the kernel domain-free.
 */

import type { Caller } from '@types';

/** A filter fragment narrowing a query, or `undefined` for no restriction. */
export type Scope = Record<string, unknown> | undefined;

/**
 * The shared rule both factories below bind: admins are unrestricted, everyone else is narrowed.
 *
 * `undefined` means "no restriction", not "match nothing" — callers SPREAD the result into a
 * query (`{ ...callerScope(ctx), status: 'paid' }`) rather than treat it as a filter in its own
 * right.
 */
const restrictNonAdmin =
    (narrow: (caller?: Caller) => Record<string, unknown>) =>
    (caller?: Caller): Scope =>
        caller?.admin ? undefined : narrow(caller);

/**
 * Build a module's `callerScope` from its repository's OWNER scope — "yours, or you are staff".
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
export const createOwnerScope = (ownerScopeOf: (userId: string) => Record<string, unknown>) =>
    restrictNonAdmin((caller) => ownerScopeOf(caller?.id ?? ''));

/**
 * Build a module's `callerScope` from its repository's PUBLIC scope — "published, or you are
 * staff".
 *
 * The caller's identity does not enter the fragment: what a visitor may read is a property of the
 * row, not of them, so an anonymous caller and a signed-in non-admin get the same scope. That is
 * also what makes the rule testable one case per role — `undefined` for admin, the published
 * fragment for both others — rather than a boolean where "guest" and "logged" are the same input.
 *
 * @param publicScopeOf - the repository's published-rows fragment, e.g. `productRepository.publicScope`
 * @returns the module's `callerScope`
 */
export const createVisibilityScope = (publicScopeOf: () => Record<string, unknown>) =>
    restrictNonAdmin(() => publicScopeOf());
