#!/usr/bin/env tsx
/**
 * @module
 * ONE-OFF. Strips the live-stock counters and the leftover per-item `_id` off every ALREADY
 * STORED order line, for a database whose orders predate `orderLineProductSchema`
 * (`orders/model.ts`). Run once — `npx tsx ops/strip-order-stock-snapshot.ts` — then delete this
 * file; nothing else in the app references it, and CLAUDE.md's rule against keeping a migration
 * around "for later" applies to this exactly as much as to a code shim.
 *
 * `items.$[].product.onHand`/`.reserved` are the warehouse counters new orders stop writing, now
 * that `orderItemSchema` embeds `orderLineProductSchema` rather than the catalogue's own schema.
 * `items.$[]._id` is what `orderItemSchema` left behind before it declared `{ _id: false }`. Both
 * are the same kind of accident: a row carrying a field the CURRENT schema no longer declares,
 * unset in one pass because there is no reason to run two.
 *
 * Uses the native driver (`.collection`, not the Mongoose model) deliberately: `onHand`, `reserved`
 * and the per-item `_id` are no longer paths `orderItemSchema` declares, and a schema-aware
 * `Model.updateMany` would have nothing to target them with. `$unset` on an absent path is a
 * no-op, so this is also safe to run twice, or on a database that never had the fields at all.
 */
import 'dotenv/config';
import { start, stopDatabase } from '@infrastructure/runtime/database';
import { orderModel } from '@modules/orders/model';
import { logger } from '@infrastructure/adapters/logger';
import { runScript } from '../db/run-script';

const main = (): Promise<void> =>
    start()
        .then(() =>
            orderModel.collection.updateMany(
                {},
                {
                    $unset: {
                        'items.$[].product.onHand': '',
                        'items.$[].product.reserved': '',
                        'items.$[]._id': ''
                    }
                }
            )
        )
        .then((result) => {
            logger.info({
                message: 'Stripped stock snapshot and leftover ids from stored orders.',
                matched: result.matchedCount,
                modified: result.modifiedCount
            });
        });

void runScript(main, stopDatabase);
