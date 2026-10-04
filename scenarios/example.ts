/**
 * @module
 * The `example` module's slice of the demo dataset: a few examples in each status, so its screens
 * open on something. `demo:remove` deletes it with the module (`group: example`).
 *
 * See: docs/tools/demo-profile.md
 */

import { Types } from 'mongoose';
import { ExampleStatus } from '@types';
import { SEED_ADMIN_ID, SEED_USER_ID } from '@scenarios/accounts';
import { type SeedOutcome, insertIfAbsent } from '@scenarios/seed';
import { makeExample, type PinnedExample } from '@modules/example/factories';
import { exampleRepository } from '@modules/example/repository';

/** The pinned ids, so a journey or a screenshot can name a row rather than search for it. */
export const SEED_EXAMPLE_IDS = {
    customerPublished: '65e1a0000000000000000e01',
    customerDraft: '65e1a0000000000000000e02',
    customerArchived: '65e1a0000000000000000e03',
    adminPublished: '65e1a0000000000000000e04'
} as const;

/**
 * The seeded examples: the customer holds one per status (so a list shows all three), and the
 * admin one published, so the public door has something to read.
 */
export const exampleFixtures: PinnedExample[] = [
    {
        ...makeExample({
            userId: SEED_USER_ID,
            title: 'Training a puppy to sit',
            body: 'Start with a treat, hold it above the nose, and wait. Reward the moment the bottom touches the floor.',
            status: ExampleStatus.published,
            publishedAt: new Date('2026-01-12T09:00:00Z')
        }),
        _id: new Types.ObjectId(SEED_EXAMPLE_IDS.customerPublished)
    },
    {
        ...makeExample({
            userId: SEED_USER_ID,
            title: 'Notes on a first vet visit',
            body: 'Bring the vaccination card, a stool sample, and a list of questions.'
        }),
        _id: new Types.ObjectId(SEED_EXAMPLE_IDS.customerDraft)
    },
    {
        ...makeExample({
            userId: SEED_USER_ID,
            title: 'A winter coat checklist',
            body: 'Measure the chest before ordering. Reflective strips matter more than the colour.',
            status: ExampleStatus.archived,
            publishedAt: new Date('2025-11-03T09:00:00Z')
        }),
        _id: new Types.ObjectId(SEED_EXAMPLE_IDS.customerArchived)
    },
    {
        ...makeExample({
            userId: SEED_ADMIN_ID,
            title: 'Welcome to the example module',
            body: 'This note exists to be copied. Read how it is built, then delete it and write your own.',
            status: ExampleStatus.published,
            publishedAt: new Date('2026-01-02T09:00:00Z')
        }),
        _id: new Types.ObjectId(SEED_EXAMPLE_IDS.adminPublished)
    }
];

/** Seed this collection. Declared in `./shop-modules`'s table; walked by `seedShop`. */
export const seedExampleCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(exampleFixtures.map((fixture) => insertIfAbsent(exampleRepository, fixture)));
