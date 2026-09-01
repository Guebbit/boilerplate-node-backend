/**
 * @module
 * The bit of fixture-building every module's `fixtures.ts` would otherwise repeat: an `_id`, a
 * pair of timestamps, and the type of the overrides bag. Timestamps are pinned rather than left
 * to Mongoose — the seed export commits what it reads back, so a `createdAt` of "whenever the
 * export ran" would make the artefact permanently stale — but this module does not guarantee the
 * three dates make sense together; a test that cares about ordering states the dates it needs.
 */

import { Types } from 'mongoose';

/** What every factory accepts on top of its own fields. */
export interface FactoryIdentity {
    /** 24-char hex. Omitted outside the seed dataset, where a fresh id is what a test wants. */
    id?: string;
    /** Wire-format date; defaults to the id's embedded timestamp when omitted. */
    createdAt?: Date | string;
    /** Wire-format date; defaults to `createdAt` when omitted. */
    updatedAt?: Date | string;
}

/**
 * A factory's overrides bag, derived from the contract entity it builds rather than hand-written.
 *
 * A field renamed in `openapi.yaml` (the source of truth) then turns every stale call site red at
 * `tsc` time. `id`/`createdAt`/`updatedAt` come from {@link FactoryIdentity} and `deletedAt` is
 * widened here, since the wire carries ISO strings where Mongoose stores `Date`s.
 */
export type OverridesFor<TEntity> = FactoryIdentity &
    Partial<Omit<TEntity, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>> & {
        deletedAt?: Date | string;
    };

/**
 * Drop keys whose value is `undefined`.
 *
 * Not named `compact` — that's lodash's own (array-only, falsy-dropping) function, and reusing
 * the name for this one invites the wrong assumption. Shared with `readInput`
 * (`@infrastructure/http/request`), which needs the identical idiom to keep a `||`-merged
 * request from carrying explicit `undefined`s through to a Mongoose filter.
 *
 * A factory spreads overrides over its own defaults, and `{ stock: undefined }` from a
 * conditionally-built caller would otherwise WIN — shadowing the default with an explicit
 * `undefined` instead of leaving the model's own `default:` to fill it.
 */
export const stripUndefined = <T extends Record<string, unknown>>(source: T): T =>
    Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined)) as T;

/**
 * A wire date as the document stores it, `undefined` passing straight through.
 *
 * The contract carries ISO strings and Mongoose stores `Date`s, so every factory has one of these
 * on every date field. Paired with `stripUndefined`, an absent date leaves no key behind — which
 * is what keeps `deletedAt` a field that is either present or missing, never present-and-undefined.
 */
export const toDate = (value: Date | string | undefined): Date | undefined =>
    value === undefined ? undefined : new Date(value);

/** `undefined` → a fresh id, a string → the pinned one. */
export const toObjectId = (id?: string): Types.ObjectId =>
    id === undefined ? new Types.ObjectId() : new Types.ObjectId(id);

/**
 * Turn a factory's identity fields into the three columns a fixture pins.
 *
 * An unstated `createdAt` is read off the `_id` — an ObjectId's leading four bytes ARE a creation
 * timestamp, so a pinned fixture id already carries its own date. `updatedAt` follows `createdAt`
 * unless stated. Note `getTimestamp()` is second-granular, so fixtures built in the same tick
 * share a `createdAt` exactly — a test that sorts/paginates by it must pass its own dates.
 */
export const identityOf = ({
    id,
    createdAt,
    updatedAt
}: FactoryIdentity): { _id: Types.ObjectId; createdAt: Date; updatedAt: Date } => {
    const objectId = toObjectId(id);
    const created = createdAt === undefined ? objectId.getTimestamp() : new Date(createdAt);
    return {
        _id: objectId,
        createdAt: created,
        updatedAt: updatedAt === undefined ? created : new Date(updatedAt)
    };
};
