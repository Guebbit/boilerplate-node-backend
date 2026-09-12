/**
 * @module
 * The action history's slice of the demo dataset — four rows telling a story `GET /audit` and
 * `GET /observability/audit` can both show happening: a checkout, a catalogue edit, a dictionary
 * edit, a ban, each by the staff account whose role actually holds the key for it. Every row
 * points at state the rest of the seed actually agrees with — the target it names really is what
 * it claims, not just a plausible-looking id.
 *
 * A refund row is deliberately absent: nothing here seeds a payment, so an
 * `admin.payment.refunded` row would name an order that was never charged. That entry returns
 * with `OFFLINE_PAYMENTS 3`, once there is a real refunded payment to point it at.
 *
 * TTL-backed on `timestamp` (`NODE_AUDIT_RETENTION_DAYS`), so a seeded row is reaped once it ages
 * past the window — which is why every fixture below dates itself relative to now.
 */

import { Types } from 'mongoose';
import { SEED_USER_ID, SEED_EDITOR_ID, SEED_MODERATOR_ID } from '@scenarios/accounts';
import { SEED_CUSTOMER_IDS } from './users';
import { SEED_PRODUCT_IDS } from './subjects';
import { orderFixtures } from './orders';
import { auditLogModel, type AuditLogDocument } from '@modules/audit-logs/model';
import type { SeedOutcome } from '@scenarios/seed';

/** `now - days`, so every row reads as recent however long ago the demo was last seeded. */
const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/** One row per story beat, oldest first. `actor_role` is the trail's closed bucket — every one
 * of these actors holds an id, so all four are `'user'`; `actor_role_name` is the one that
 * actually says who. `actor_scope` is always `'tenant'` here — every actor below acts within the
 * one seeded tenant, never as a platform key (`buildAuditEvent`'s own default). */
export const auditLogFixtures: (Partial<AuditLogDocument> & { _id: Types.ObjectId })[] = [
    {
        _id: new Types.ObjectId('65df2a2b3c4d5e6f7a8b9c01'),
        actor_user_id: SEED_USER_ID,
        actor_role: 'user',
        actor_role_name: 'customer',
        actor_scope: 'tenant',
        action: 'order.created',
        outcome: 'success',
        target_type: 'order',
        // `customerOrders[0]` — the customer's own order, not the owner's. `order.created` fires
        // for whoever placed it; crediting it to a different account is a story the rest of the
        // seed denies.
        target_id: orderFixtures[4]._id.toString(),
        timestamp: daysAgo(6),
        level: 'info'
    },
    {
        _id: new Types.ObjectId('65df2a2b3c4d5e6f7a8b9c02'),
        actor_user_id: SEED_EDITOR_ID,
        actor_role: 'user',
        actor_role_name: 'editor',
        actor_scope: 'tenant',
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
        actor_scope: 'tenant',
        action: 'admin.locale_entry.updated',
        outcome: 'success',
        // Matches what `updateEntry` actually emits (`locales/services/entries.ts`): the
        // underscored type, the entry's own `_id` as `target_id`, and the key — not the new
        // text — in `metadata`. `65e0200a9a7d4b2e1c0f3101` is `./locales`'s seeded Italian
        // override of `generic.error-unauthorized`, a key that really exists for `it`.
        target_type: 'locale_entry',
        target_id: '65e0200a9a7d4b2e1c0f3101',
        metadata: { locale: 'it', key: 'generic.error-unauthorized' },
        timestamp: daysAgo(3),
        level: 'info'
    },
    {
        _id: new Types.ObjectId('65df2a2b3c4d5e6f7a8b9c04'),
        actor_user_id: SEED_MODERATOR_ID,
        actor_role: 'user',
        actor_role_name: 'moderator',
        actor_scope: 'tenant',
        action: 'admin.user.banned',
        outcome: 'success',
        target_type: 'user',
        // `./users` seeds marcus `active: false` to match — a ban this row records without the
        // rest of the seed contradicting it.
        target_id: SEED_CUSTOMER_IDS.marcus,
        timestamp: daysAgo(2),
        level: 'info'
    }
];

/**
 * Seed this collection. Declared in `./index`'s `shopModules`; walked by `seedShop`.
 *
 * No `insertIfAbsent` — that helper needs a repository with `findById`, and `auditLogRepository`
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
