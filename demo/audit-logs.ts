/**
 * @module
 * The action history's slice of the demo dataset — five rows telling a story `GET /audit` and
 * `GET /observability/audit` can both show happening: a checkout, a catalogue edit, a dictionary
 * edit, a ban, a refund, each by the staff account whose role actually holds the key for it.
 *
 * Deliberately absent from `demo/index.ts`'s export/shapes contract — see `seedAuditLogsCollection`
 * below for why a TTL-backed collection cannot join the byte-stable dataset the other modules do.
 */

import { Types } from 'mongoose';
import { SEED_USER_ID, SEED_EDITOR_ID, SEED_MODERATOR_ID } from '@kernel/seed-accounts';
import { SEED_CUSTOMER_IDS } from './users';
import { SEED_PRODUCT_IDS } from './products';
import { orderFixtures } from './orders';
import { auditLogModel, type AuditLogDocument } from '@modules/audit-logs/model';
import type { SeedOutcome } from '@infrastructure/persistence/seed';

/** `now - days`, so every row reads as recent however long ago the demo was last seeded. */
const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/** One row per story beat, oldest first. `actor_role` is the trail's closed bucket — every one
 * of these actors holds an id, so all five are `'user'`; `actor_role_name` is the one that
 * actually says who. */
export const auditLogFixtures: (Partial<AuditLogDocument> & { _id: Types.ObjectId })[] = [
    {
        _id: new Types.ObjectId('65df2a2b3c4d5e6f7a8b9c01'),
        actor_user_id: SEED_USER_ID,
        actor_role: 'user',
        actor_role_name: 'customer',
        action: 'order.created',
        outcome: 'success',
        target_type: 'order',
        target_id: orderFixtures[0]._id.toString(),
        timestamp: daysAgo(6),
        level: 'info'
    },
    {
        _id: new Types.ObjectId('65df2a2b3c4d5e6f7a8b9c02'),
        actor_user_id: SEED_EDITOR_ID,
        actor_role: 'user',
        actor_role_name: 'editor',
        action: 'admin.product.updated',
        outcome: 'success',
        target_type: 'product',
        target_id: SEED_PRODUCT_IDS.dogFoodStandard,
        timestamp: daysAgo(4),
        level: 'info'
    },
    {
        _id: new Types.ObjectId('65df2a2b3c4d5e6f7a8b9c03'),
        actor_user_id: SEED_EDITOR_ID,
        actor_role: 'user',
        actor_role_name: 'editor',
        action: 'admin.locale_entry.updated',
        outcome: 'success',
        target_type: 'localeEntry',
        target_id: 'it.products.list.title',
        timestamp: daysAgo(3),
        level: 'info'
    },
    {
        _id: new Types.ObjectId('65df2a2b3c4d5e6f7a8b9c04'),
        actor_user_id: SEED_MODERATOR_ID,
        actor_role: 'user',
        actor_role_name: 'moderator',
        action: 'admin.user.banned',
        outcome: 'success',
        target_type: 'user',
        target_id: SEED_CUSTOMER_IDS.marcus,
        timestamp: daysAgo(2),
        level: 'info'
    },
    {
        _id: new Types.ObjectId('65df2a2b3c4d5e6f7a8b9c05'),
        actor_user_id: SEED_MODERATOR_ID,
        actor_role: 'user',
        actor_role_name: 'moderator',
        action: 'admin.payment.refunded',
        outcome: 'success',
        target_type: 'order',
        target_id: orderFixtures[1]._id.toString(),
        timestamp: daysAgo(1),
        level: 'info'
    }
];

/**
 * Seed this collection. Declared in `./index`; called by `db/demo/index.ts`.
 *
 * No `upsertById` — that helper needs a repository with `findById`, and `auditLogRepository`
 * deliberately has none (see its own docblock: an audit trail is append-and-read, nothing else).
 * Written against `auditLogModel` instead, with the same skip-if-present policy by hand.
 */
export const seedAuditLogsCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(
        auditLogFixtures.map((fixture) =>
            auditLogModel
                .exists({ _id: fixture._id })
                .then((found) =>
                    found
                        ? 'skipped'
                        : auditLogModel.create(fixture).then((): SeedOutcome => 'created')
                )
        )
    );

/**
 * No export, on purpose — TWO reasons, either one enough on its own:
 *
 *   - the TTL index reaps rows past `NODE_AUDIT_RETENTION_DAYS`, so a byte pinned today is a row
 *     `check:seed-export` would find missing after the window passes;
 *   - `timestamp` is deliberately `now`-relative (`daysAgo`, above) so the history always reads as
 *     recent, and a relative value can never be the fixed byte a committed export needs.
 *
 * The trail stays fully seeded and fully live either way — `demo-data.json` is a published
 * snapshot for the frontend's mocks, and this collection has no mock to serve; the frontend reads
 * `GET /audit` from the running API, same as every other admin screen that shows it.
 */
export const exportSeededAuditLogs = (): Promise<Record<string, unknown[]>> => Promise.resolve({});
