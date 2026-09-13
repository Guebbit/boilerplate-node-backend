/**
 * `verified: boolean` becomes `role` + `verifiedAt: Date | null` — SECURITY_HOLES_1B. Enforcement
 * moves off a route guard (`requireVerified`) and onto the permission model (`cart.checkout`), so
 * the fact "may this account spend" has to live on the SAME field authorization already reads.
 *
 * Preserves today's behaviour exactly — nobody's access changes:
 *
 * | `verified` today | Becomes                               |
 * | ----------------- | -------------------------------------- |
 * | `true`             | role `customer` (if not already staff), `verifiedAt` backfilled from `createdAt` |
 * | `false` or absent  | role `unverified` (if not already staff), `verifiedAt: null` |
 *
 * `verifiedAt` for an already-verified account has no true value to recover — `createdAt` is a
 * documented LOWER BOUND, not a measurement, which keeps every "verified before X" query
 * conservative. A role already something other than the default (`manager`, `owner`, an
 * operator-granted role on an unproven address — see `shared/authorization-roles.yaml`'s "no
 * unverified manager" rule) is left untouched either way: only an absent or `'customer'` role is
 * classified by `verified`, which is exactly the set the old schema default could have produced.
 *
 * Idempotent: a second run finds no `verified` field left to filter on and changes nothing.
 */
import type { Db } from 'mongodb';

export const up = (database: Db): Promise<void> =>
    database
        .collection('users')
        .updateMany({ verified: { $exists: true } }, [
            {
                $set: {
                    role: {
                        $cond: [
                            { $eq: [{ $ifNull: ['$role', 'customer'] }, 'customer'] },
                            { $cond: ['$verified', 'customer', 'unverified'] },
                            '$role'
                        ]
                    },
                    verifiedAt: { $cond: ['$verified', { $ifNull: ['$verifiedAt', '$createdAt'] }, null] }
                }
            },
            { $unset: 'verified' }
        ])
        .then(() => undefined);
