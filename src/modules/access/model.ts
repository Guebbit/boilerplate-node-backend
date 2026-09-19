/**
 * @module
 * The two collections the authorization model is stored in: who the shops are, and who holds
 * which role where.
 *
 * ITS OWN MODULE, ROUTELESS ON PURPOSE. Tenants and memberships are an identity-and-access domain
 * with real write invariants (see `./service.ts`), consumed by `account`, `api-keys` and `users`
 * plus `db` scripts and `scenarios` — several unrelated modules sharing one domain is reason
 * enough for its own module, the same reasoning `addresses` is split out of `account` for. It
 * answers to no route of its own: `permissions.ts`, `ability.ts` and `access/query.ts` stay in
 * the kernel, because the route guard is kernel code and they are what it asks — this module is
 * the domain those files ask about, not the asking itself.
 *
 * ROLES ARE DATA, PERMISSIONS ARE CODE — but the DATA half lives in `shared/authorization-roles.yaml`
 * alone now, not in this database: a role's permissions are the same for every deployment, and a
 * Mongo row editable at runtime was a second definition of the same fact, silently out of sync with
 * the file the PHP twin reads byte-for-byte. `memberships` is the part that genuinely is per-database
 * data — WHO holds a role, never WHAT a role holds.
 *
 * See: docs/theory/authorization.md
 */

import { model, Schema } from 'mongoose';
import type { Document, Model } from 'mongoose';
import type { AuthorizationScope } from '@types';

/**
 * One shop — and this deployment holds exactly one, deliberately, because serving many clients is
 * a deployment concern here rather than an application one. There are no others to notice: a
 * second client gets a second stack and a second database. See docs/theory/tenancy.md.
 */
export interface TenantDocument extends Document {
    /** Stable, human-readable, and the thing a deployment names in configuration. */
    slug: string;
    name: string;
    createdAt?: Date;
    updatedAt?: Date;
}

/**
 * One person holding one role in one place.
 *
 * The row that makes "a member of several associations with different roles in each" expressible,
 * which is the requirement this collection exists to meet.
 * `tenantId` is `null` for a platform membership, which is the same `null` the caller carries in
 * that scope.
 */
export interface MembershipDocument extends Document {
    userId: string;
    tenantId: string | null;
    role: string;
    scope: AuthorizationScope;
    createdAt?: Date;
    updatedAt?: Date;
}

const tenantSchema = new Schema<TenantDocument>(
    {
        slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
        name: { type: String, required: true, trim: true }
    },
    { timestamps: true }
);

const membershipSchema = new Schema<MembershipDocument>(
    {
        userId: { type: String, required: true },
        tenantId: { type: String, default: null },
        role: { type: String, required: true, lowercase: true, trim: true },
        scope: { type: String, required: true, enum: ['tenant', 'platform'] }
    },
    { timestamps: true }
);

/*
 * One membership per person per place. A second row for the same pair is not a wider grant, it is
 * two answers to "what may they do here" — and the resolver would have to pick one.
 */
membershipSchema.index({ userId: 1, tenantId: 1, scope: 1 }, { unique: true });

/** Lookups the resolver makes on every authenticated request. */
membershipSchema.index({ userId: 1 });

/** The shop collection, typed for the store. */
export type TenantModel = Model<TenantDocument>;

/** The "who holds which role, where" collection, typed for the store. */
export type MembershipModel = Model<MembershipDocument>;

/** The shop rows. */
export const tenantModel: TenantModel = model<TenantDocument>('Tenant', tenantSchema);

/** The membership rows the resolver reads to answer "which role, in which scope". */
export const membershipModel: MembershipModel = model<MembershipDocument>(
    'Membership',
    membershipSchema
);
