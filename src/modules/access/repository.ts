/**
 * @module
 * The one door onto the tenant and membership collections. `./service.ts` carries every
 * invariant; this file only shapes the query.
 *
 * See: docs/theory/authorization.md
 */

import { Types } from 'mongoose';
import type { AuthorizationScope } from '@types';
import { membershipModel, tenantModel } from './model';
import type { MembershipDocument, TenantDocument } from './model';

/** The tenant collection's one write shape: create-or-return, keyed on the slug. */
export const tenantRepository = {
    /**
     * `$setOnInsert` only — an existing tenant keeps its `slug`/`name`/`_id` even if the caller
     * passed different ones. `id` is set only on insert, so a fixed id survives every reseed.
     */
    upsertBySlug: (slug: string, name: string, id?: string): Promise<TenantDocument> =>
        tenantModel
            .findOneAndUpdate(
                { slug },
                {
                    $setOnInsert: {
                        slug,
                        name,
                        ...(id ? { _id: new Types.ObjectId(id) } : {})
                    }
                },
                { returnDocument: 'after', upsert: true }
            )
            // `upsert: true` + `returnDocument: 'after'` guarantee a document — found or just
            // created — so this can never resolve `null` the way a plain `findOneAndUpdate` can.
            .exec() as Promise<TenantDocument>
};

/** The membership collection's queries — who holds which role, where. */
export const membershipRepository = {
    /** Every place a person holds a role. */
    findByUserId: (userId: string): Promise<MembershipDocument[]> =>
        membershipModel.find({ userId }).exec(),

    /** One person's row in one place, or `null` when they hold nothing there. */
    findOne: (
        userId: string,
        tenantId: string | null,
        scope: AuthorizationScope
    ): Promise<MembershipDocument | null> =>
        membershipModel.findOne({ userId, tenantId, scope }).exec(),

    /** Create-or-overwrite the role a person holds in one place. */
    upsertRole: (
        userId: string,
        tenantId: string | null,
        scope: AuthorizationScope,
        role: string
    ): Promise<MembershipDocument> =>
        membershipModel
            .findOneAndUpdate(
                { userId, tenantId, scope },
                { $set: { role } },
                { returnDocument: 'after', upsert: true }
            )
            // `upsert: true` + `returnDocument: 'after'` guarantee a document — found or just
            // created — so this can never resolve `null` the way a plain `findOneAndUpdate` can.
            .exec() as Promise<MembershipDocument>,

    /** Remove one row by its own id. */
    deleteById: (id: MembershipDocument['_id']): Promise<{ deletedCount?: number }> =>
        membershipModel.deleteOne({ _id: id }).exec(),

    /** Every membership row for a set of people, in one place — the batched sibling of `findOne`. */
    findByUserIds: (
        userIds: readonly string[],
        tenantId: string | null,
        scope: AuthorizationScope
    ): Promise<MembershipDocument[]> =>
        membershipModel.find({ userId: { $in: userIds }, tenantId, scope }).exec()
};
