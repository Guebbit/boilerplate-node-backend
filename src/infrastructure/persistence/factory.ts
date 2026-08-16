/**
 * The bit of fixture-building every module's `factory.ts` would otherwise repeat: an `_id`, a pair
 * of timestamps, and the type of the overrides bag.
 *
 * Lives in `infrastructure` for the same reason `./seed` does — it knows a document has an `_id`
 * and nothing about what the document means.
 *
 * ## Why the timestamps are pinned rather than left to Mongoose
 *
 * `scripts/export-seed.ts` seeds a throwaway database and commits what it reads back. With
 * `timestamps: true` doing the writing, `createdAt` would be the moment the export ran, the file
 * would differ on every run, and `npm run check:seed-export` could never pass — the artefact would
 * be permanently "stale" and the cross-repo hash check permanently red.
 *
 * So a fixture states its own dates and the seeder saves with `{ timestamps: false }`.
 *
 * ## What this deliberately does NOT guarantee
 *
 * That the three dates make sense together. A fixture can carry a `deletedAt` that precedes its
 * `createdAt`, two fixtures built in the same second share a `createdAt` to the second, and an
 * `updatedAt` need not be later than either.
 *
 * Preventing that would cost more than it is worth: a clock the factories share, an ordering rule
 * per collection, and a class of failure where adding a fixture silently renumbers another one's
 * dates. A test that cares about ordering should state the dates it needs — every factory takes
 * them — and one that does not should not have machinery protecting it from a question it never
 * asks.
 */

import { Types } from 'mongoose';

/** What every factory accepts on top of its own fields. */
export interface FactoryIdentity {
    /** 24-char hex. Omitted outside the seed dataset, where a fresh id is what a test wants. */
    id?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
}

/**
 * A factory's overrides bag, derived from the contract entity it builds.
 *
 * This exists so a factory never restates a field list. `openapi.yaml` is the source of truth in
 * this repo, orval turns it into `api/models`, and those models already say what a Product or a
 * User has — so a hand-written `{ title?: string; price?: number; … }` beside them is a second
 * declaration that a contract change cannot reach. Deriving means a field renamed in the spec turns
 * every stale call site red at `tsc` time instead of at nobody's time.
 *
 * Three fields are replaced rather than inherited, and all for the same reason: the wire carries ISO
 * strings where Mongoose stores `Date`s. `id`, `createdAt` and `updatedAt` come from
 * `FactoryIdentity`; `deletedAt` is widened here to accept either.
 */
export type OverridesFor<TEntity> = FactoryIdentity &
    Partial<Omit<TEntity, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>> & {
        deletedAt?: Date | string;
    };

/**
 * Drop keys whose value is `undefined`.
 *
 * A factory spreads its caller's overrides over its own defaults, and `{ stock: undefined }` from a
 * caller that built the object conditionally would otherwise WIN — turning "I did not say" into an
 * explicit `undefined` that shadows the default. It also matters downstream: the whole point of a
 * factory that omits a field is to let the model's own `default:` fill it, so the export records
 * what the schema really does instead of what a fixture guessed it does.
 */
export const compact = <T extends Record<string, unknown>>(source: T): T =>
    Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined)) as T;

/**
 * A wire date as the document stores it, `undefined` passing straight through.
 *
 * The contract carries ISO strings and Mongoose stores `Date`s, so every factory has one of these
 * on every date field. Paired with `compact`, an absent date leaves no key behind — which is what
 * keeps `deletedAt` a field that is either present or missing, never present-and-undefined.
 */
export const toDate = (value: Date | string | undefined): Date | undefined =>
    value === undefined ? undefined : new Date(value);

/** `undefined` → a fresh id, a string → the pinned one. */
export const toObjectId = (id?: string): Types.ObjectId =>
    id === undefined ? new Types.ObjectId() : new Types.ObjectId(id);

/**
 * Turn a factory's identity fields into the three columns a fixture pins.
 *
 * An unstated `createdAt` is read off the `_id`. An ObjectId's leading four bytes ARE a creation
 * timestamp, so a pinned fixture id already carries the date the record was made — `65dc8a99…` is
 * 2024-02-26 — and a fresh one carries now. That is one code path for both cases, it invents no
 * dates, and it needs no second constant maintained alongside the ids.
 *
 * `updatedAt` follows `createdAt` unless stated: a record that has never been edited should say so.
 *
 * Note the precision. `getTimestamp()` is second-granular, so fixtures built in the same tick share
 * a `createdAt` exactly. A test that sorts or paginates by it must pass its own dates; see the
 * header for why that is the caller's job rather than this file's.
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
