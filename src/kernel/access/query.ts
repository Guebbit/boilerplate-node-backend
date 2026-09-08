/**
 * @module
 * Turning a caller's rules into the MongoDB filter that answers them — the piece that makes
 * *"the restriction rides IN the read"* something a library guarantees rather than something four
 * modules each remembered to do.
 *
 * Before this, every module built its own fragment and the kernel decided whether to apply it. The
 * fragment and the rule agreed because somebody kept them agreeing; a widened rule did not widen
 * the query, and a widened query failed no test. Now there is one artefact: `@casl/mongoose`
 * compiles the same rules the route guard reads, so a key that grants more returns more, and a key
 * that grants less returns less, without anybody editing a filter.
 *
 * IT FAILS CLOSED BY CONSTRUCTION. When no rule matches, CASL answers `EMPTY_RESULT_QUERY` —
 * `{ $expr: { $eq: [0, 1] } }` — a filter that matches nothing rather than a filter that is
 * missing. That is strictly stronger than the empty-string trick it replaces, which was a clever
 * way to make a mistake loud; this makes the mistake unrepresentable.
 *
 * See: docs/theory/authorization.md
 */

import { accessibleBy } from '@casl/mongoose';
import { Types } from 'mongoose';
import type { AuthContext } from '@types';
import { buildAbility } from '@kernel/ability';
import { anonymousCaller, callerForSubject } from '@kernel/permissions';

/**
 * Fields the rules speak that this deployment's collections do not store.
 *
 * `tenantId` is the only one, and it is here rather than absent from the rules for a reason worth
 * stating: the MODEL is tenant-aware and its conformance cases prove it, while this deployment's
 * collections are not partitioned, because it ships one shop. Compiling `tenantId` into a query
 * over a collection that has no such field would match nothing and lock everybody out — the plan's
 * own line that "a single-tenant app runs this model with one tenant row and never notices" is
 * exactly this function.
 *
 * A multi-tenant deployment deletes this list and adds the column. Nothing else changes: the rules
 * already carry the tenant, the guards already read it, and the caller already resolves it.
 */
const UNSTORED_FIELDS = new Set(['tenantId']);

/** Fields whose VALUE has to be coerced on the way into a query. */
const coerce: Record<string, (value: unknown) => unknown> = {
    /*
     * The owner is an ObjectId in the collection and a string on the caller. Left as a string the
     * filter silently matches nothing, which is the same failure as a missing restriction wearing
     * the opposite disguise — everything hidden rather than everything shown.
     */
    userId: (value) => (typeof value === 'string' ? new Types.ObjectId(value) : value)
};

/**
 * Rewrite one compiled condition object into the shape the collection actually stores.
 *
 * Recursive because CASL emits `$or`/`$and` arrays when a caller holds several rules for one
 * subject — one per key — and each branch needs the same treatment.
 */
const toStorage = (query: unknown): unknown => {
    if (Array.isArray(query)) {
        return query.map((branch) => toStorage(branch));
    }

    if (!query || typeof query !== 'object') {
        return query;
    }

    const rewritten: Record<string, unknown> = {};

    for (const [field, value] of Object.entries(query as Record<string, unknown>)) {
        if (UNSTORED_FIELDS.has(field)) {
            continue;
        }

        rewritten[field] = field.startsWith('$')
            ? toStorage(value)
            : field in coerce
              ? coerce[field](value)
              : value;
    }

    return rewritten;
};

/** A branch with no conditions left, which every row satisfies. */
const matchesEverything = (branch: unknown): boolean =>
    typeof branch === 'object' && branch !== null && Object.keys(branch).length === 0;

/**
 * Collapse an `$or` that no longer says anything.
 *
 * CASL emits one branch per rule, so a caller holding several keys for one subject gets an `$or`
 * of their conditions. Two of those shapes are worth simplifying, and both come straight from
 * dropping the tenant discriminator above:
 *
 *   - a branch that is `{}` matches every row, so the whole `$or` does — a caller who may read
 *     everything through one key is not narrowed by also holding a narrower one;
 *   - a single branch is not a choice at all.
 *
 * Correctness first and legibility second: `{ $or: [{}, { active: true }] }` and `{}` return the
 * same rows, and only one of them is readable in a slow-query log.
 */
const collapse = (filter: Record<string, unknown>): Record<string, unknown> => {
    const branches = filter.$or;

    if (!Array.isArray(branches)) {
        return filter;
    }

    if (branches.some((branch: unknown) => matchesEverything(branch))) {
        return {};
    }

    return branches.length === 1 ? (branches[0] as Record<string, unknown>) : filter;
};

/**
 * The filter that returns exactly the rows this caller may take this action on.
 *
 * SPREAD IT into a query (`{ ...accessibleFilter(ctx, 'Order'), status: 'paid' }`) — it is a
 * fragment, not a whole query, and an unrestricted caller's fragment is `{}` rather than
 * `undefined`, because "no conditions" and "no rules" must not look alike to the caller.
 *
 * @param context - the resolved session, or `undefined` for an anonymous request
 * @param subject - the CASL subject the collection holds, e.g. `Order`
 * @param action - the action being taken; `read` unless stated
 */
export const accessibleFilter = (
    context: AuthContext | undefined,
    subject: string,
    action = 'read'
): Record<string, unknown> => {
    const caller = context ? callerForSubject(context, subject) : anonymousCaller();
    const compiled = accessibleBy(buildAbility(caller), action).ofType(subject);

    return collapse(toStorage(compiled) as Record<string, unknown>);
};
