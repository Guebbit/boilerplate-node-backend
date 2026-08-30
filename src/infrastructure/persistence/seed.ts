/**
 * The seeding primitive every module's `demo.ts` upserts through.
 *
 * Lives in `infrastructure` because it knows nothing about any domain: a repository shape and a fixture with
 * a fixed `_id`. The demo dataset itself belongs to the modules — `infrastructure` naming `products` is the
 * coupling this whole layout exists to remove.
 */

import type { Model, Types } from 'mongoose';

/** Whether a fixture was written or was already present. Counted by the runner. */
export type SeedOutcome = 'created' | 'skipped';

/**
 * The slice of a repository seeding needs. Structural, so every module's repository satisfies it.
 *
 * Generic over the fixture rather than declaring `create: (data: never)`. `never` made every
 * repository assignable — nothing can be passed to it, so nothing conflicts — at the price of an
 * `as never` at the one call site that actually passes something. Naming the type instead means
 * the fixture is checked against the repository that will store it.
 */
export interface SeedRepository<TFixture> {
    findById: (id: string) => PromiseLike<unknown>;
    create: (data: TFixture, options?: { timestamps: false }) => Promise<unknown>;
}

/**
 * The same slice for a collection addressed by its OWNER — see {@link upsertByOwner}.
 */
export interface OwnedSeedRepository<TFixture> {
    findByUserId: (userId: string) => PromiseLike<unknown>;
    create: (data: TFixture, options?: { timestamps: false }) => Promise<unknown>;
}

/**
 * What every seed write passes to `save()`.
 *
 * A fixture states its own `createdAt` — read off its pinned `_id`, see `./fixtures` — and Mongoose's
 * `timestamps: true` would overwrite it with the instant the seeder ran. That is not a cosmetic
 * loss: `scripts/export-demo-dataset.ts` commits what it reads back, so a run-dependent timestamp would
 * make `db/demo/demo-data.json` differ on every export and its staleness check could never pass.
 */
export const SEED_SAVE_OPTIONS = { timestamps: false } as const;

/**
 * Upsert one fixture by its fixed `_id`.
 *
 * Documents go through `create()` — and therefore `save()` — rather than
 * `updateOne(..., { upsert: true })`, so the model's pre-save hooks still run. Most importantly the
 * bcrypt password hash, which a raw driver write would skip.
 *
 * Note what idempotent means here: an existing `_id` is SKIPPED, not rewritten. Re-running the
 * seeder does not repair a database seeded from older fixtures — a migration does that.
 *
 * @param repository - the owning module's repository
 * @param fixture - a document with a pinned `_id`
 */
export const upsertById = <TFixture extends { _id: Types.ObjectId }>(
    repository: SeedRepository<TFixture>,
    fixture: TFixture
): Promise<SeedOutcome> =>
    Promise.resolve(repository.findById(fixture._id.toString())).then((existing) =>
        existing
            ? 'skipped'
            : repository.create(fixture, SEED_SAVE_OPTIONS).then((): SeedOutcome => 'created')
    );

/**
 * Upsert one fixture by its OWNER rather than by its id.
 *
 * Carts, wishlists and address books have no pinned `_id` to key on — `userId` is the unique column
 * and the one every query reaches them through — so the same skip-if-present policy {@link upsertById}
 * states against `_id` is stated here against the owner.
 *
 * @param repository - the owning module's repository
 * @param fixture - a document whose `userId` identifies it
 */
export const upsertByOwner = <TFixture extends { userId: Types.ObjectId }>(
    repository: OwnedSeedRepository<TFixture>,
    fixture: TFixture
): Promise<SeedOutcome> =>
    Promise.resolve(repository.findByUserId(fixture.userId.toString())).then((existing) =>
        existing
            ? 'skipped'
            : repository.create(fixture, SEED_SAVE_OPTIONS).then((): SeedOutcome => 'created')
    );

/**
 * Read one collection back the way the exported dataset must record it.
 *
 * The `toJSON()` step is the load-bearing part: `registry.ts` requires the export to read back
 * through the model's real serializer, or `seed-conformance.test.ts` ends up comparing the
 * fixtures to themselves.
 *
 * @param model - the collection's Mongoose model
 * @param sort - a total order, so a re-export of unchanged data is byte-identical
 * @returns every document, serialized as the API would serialize it
 */
export const exportCollection = <TDocument>(
    model: Model<TDocument>,
    sort: Record<string, 1 | -1>
): Promise<unknown[]> =>
    model
        .find()
        // eslint-disable-next-line unicorn/no-array-sort -- Mongoose's Query#sort, not Array#sort
        .sort(sort)
        .exec()
        .then((documents) => documents.map((document_) => document_.toJSON()));
