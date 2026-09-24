/**
 * @module
 * The seeding primitive every scenario module writes fixtures through — just a repository shape
 * and a fixture with a fixed `_id`, nothing that knows about any one domain.
 */

import type { Types } from 'mongoose';

/** Whether a fixture was written or was already present. Counted by the runner. */
export type SeedOutcome = 'created' | 'skipped';

/**
 * The slice of a repository seeding needs. Structural, so every module's repository satisfies it.
 *
 * Generic over the fixture rather than `create: (data: never)` — `never` made every repository
 * assignable at the cost of an `as never` cast at the one call site that used it. Naming the type
 * checks the fixture against the repository that will actually store it.
 */
export interface SeedRepository<TFixture> {
    findById: (id: string) => PromiseLike<unknown>;
    create: (data: TFixture) => Promise<unknown>;
}

/**
 * The same slice for a collection addressed by its OWNER — see {@link insertIfAbsentForOwner}.
 */
export interface OwnedSeedRepository<TFixture> {
    findByUserId: (userId: string) => PromiseLike<unknown>;
    create: (data: TFixture) => Promise<unknown>;
}

/**
 * Shared by {@link insertIfAbsent} and {@link insertIfAbsentForOwner}: write `fixture` through
 * `create()` unless `present()` finds it.
 *
 * `create()`/`save()` rather than `updateOne(..., { upsert: true })`, so pre-save hooks still run —
 * most importantly the bcrypt password hash, which a raw driver write would skip. An existing row
 * is SKIPPED, never rewritten: re-running this does not repair a database seeded from older
 * fixtures — this never updates, which is why it is named "insert", not "upsert".
 *
 * @param present - resolves to the row if one is already there, else `undefined`
 * @param repository - the owning module's repository
 * @param fixture - the document to write
 */
const insertIfAbsentBy = <TFixture>(
    present: () => PromiseLike<unknown>,
    repository: { create: (data: TFixture) => Promise<unknown> },
    fixture: TFixture
): Promise<SeedOutcome> =>
    Promise.resolve(present()).then((existing) =>
        existing ? 'skipped' : repository.create(fixture).then((): SeedOutcome => 'created')
    );

/**
 * Insert one fixture by its fixed `_id`, unless it is already there.
 *
 * @param repository - the owning module's repository
 * @param fixture - a document with a pinned `_id`
 */
export const insertIfAbsent = <TFixture extends { _id: Types.ObjectId }>(
    repository: SeedRepository<TFixture>,
    fixture: TFixture
): Promise<SeedOutcome> =>
    insertIfAbsentBy(() => repository.findById(fixture._id.toString()), repository, fixture);

/**
 * {@link insertIfAbsent}, keyed by the fixture's OWNER rather than by its id.
 *
 * Carts, wishlists and address books have no pinned `_id` — `userId` is the unique column every
 * query reaches them through, so {@link insertIfAbsent}'s skip-if-present policy is stated here
 * against the owner instead.
 *
 * @param repository - the owning module's repository
 * @param fixture - a document whose `userId` identifies it
 */
export const insertIfAbsentForOwner = <TFixture extends { userId: Types.ObjectId }>(
    repository: OwnedSeedRepository<TFixture>,
    fixture: TFixture
): Promise<SeedOutcome> =>
    insertIfAbsentBy(() => repository.findByUserId(fixture.userId.toString()), repository, fixture);
