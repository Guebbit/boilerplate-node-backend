/**
 * @module
 * The one authorization rule four domains share: *a caller holding the wide key reads everything
 * in their tenant, everyone else reads a narrowed slice*. The slice differs — own rows for
 * `orders`/`payments`, published-only for `products`/`locales` — but was written four times
 * identically otherwise, and the drift is silent: a widened scope doesn't fail a test, it just
 * returns more rows. Lives beside `authentication.ts`/`middlewares/authorizations.ts` (WHO the
 * caller is); this decides which ROWS they see. The scope builder arrives as an argument, not an
 * import, keeping the kernel domain-free.
 */

import type { AuthContext } from '@types';
import { buildAbility } from '@kernel/ability';
import { anonymousCaller, callerForSubject } from '@kernel/permissions';

/**
 * Does this caller read every row of the subject IN THEIR TENANT?
 *
 * Asked of the ability rather than of a role name, so the guard on the route and the filter on
 * the query cannot disagree — both read the same rules. `products.manage` grants an unconditional
 * read; `products.read` carries `published: true` and does not. That distinction is the whole
 * reason staff see drafts and nobody needs a `products.read-drafts` key.
 *
 * `tenantId` does not count as a restriction here, and that is the subtle part. Every tenant-scope
 * rule carries it — the ability injects it from the caller so no key can forget it — so counting
 * it would make "unrestricted" unreachable for everyone. The question this asks is *within the
 * shop you are already in*; crossing shops is not something a scope fragment can express, and it
 * is `buildAbility` that makes it impossible rather than this.
 */
const TENANT_DISCRIMINATOR = 'tenantId';

const readsEverything = (context: AuthContext | undefined, subject: string): boolean =>
    buildAbility(context ? callerForSubject(context, subject) : anonymousCaller())
        .rulesFor('read', subject)
        .some(
            (rule) =>
                !rule.conditions ||
                Object.keys(rule.conditions).every((field) => field === TENANT_DISCRIMINATOR)
        );

/**
 * The shared rule both factories below bind: an unrestricted caller is not narrowed, everyone
 * else is.
 *
 * `undefined` means "no restriction", not "match nothing" — callers SPREAD the result into a
 * query (`{ ...callerScope(ctx), status: 'paid' }`) rather than treat it as a filter in its own
 * right.
 *
 * An absent caller is the `guest` role rather than a null branch: a stranger is a value in the
 * model, and giving them one here is what stops every call site inventing its own answer.
 */
const restrictNarrow =
    (subject: string, narrow: (context?: AuthContext) => Record<string, unknown>) =>
    (context?: AuthContext): Record<string, unknown> | undefined =>
        readsEverything(context, subject) ? undefined : narrow(context);

/**
 * Build a module's `callerScope` from its repository's OWNER scope — "yours, or you hold the wide key".
 *
 * In the read: the restriction has to ride IN the read. Fetching a row and then checking its
 *              owner is what `orders/repository.ts` names as the way a scoped find turns into a
 *              leak: it opens a window between the check and whatever uses the document, and it
 *              lets "not yours" and "does not exist" answer differently.
 * `?? ''`:     deliberate and load-bearing. A caller with no id yields an empty string, which is
 *              not a valid ObjectId, so `ownerScopeOf` throws. That is the safe direction — the
 *              alternative is omitting the owner clause, which does not fail anything and quietly
 *              widens the query to every user's data. A bug here becomes a 500, never a
 *              disclosure.
 *
 * @param subject - the CASL subject this module's rows are, e.g. `Order`
 * @param ownerScopeOf - the repository's owner scope, e.g. `orderRepository.visibleScope`. Must
 *   throw on an empty id rather than return an empty fragment, or the fail-closed property above
 *   is lost.
 * @returns the module's `callerScope`
 */
export const createOwnerScope = (
    subject: string,
    ownerScopeOf: (userId: string) => Record<string, unknown>
) => restrictNarrow(subject, (context) => ownerScopeOf(context?.id ?? ''));

/**
 * Build a module's `callerScope` from its repository's PUBLIC scope — "published, or you hold the
 * wide key".
 *
 * The caller's identity does not enter the fragment: what a visitor may read is a property of the
 * row, not of them, so an anonymous caller and a signed-in customer get the same scope. That is
 * also what makes the rule testable one case per role — `undefined` for a manager, the published
 * fragment for both others — rather than a boolean where "guest" and "logged" are the same input.
 *
 * @param subject - the CASL subject this module's rows are, e.g. `Product`
 * @param publicScopeOf - the repository's published-rows fragment, e.g. `productRepository.publicScope`
 * @returns the module's `callerScope`
 */
export const createVisibilityScope = (
    subject: string,
    publicScopeOf: () => Record<string, unknown>
) => restrictNarrow(subject, () => publicScopeOf());
