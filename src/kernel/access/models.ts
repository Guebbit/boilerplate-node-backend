/**
 * @module
 * The three collections the authorization model is stored in: who the shops are, what a role
 * holds, and who holds which role where.
 *
 * IN THE KERNEL, NOT A MODULE, and that is the one structural decision here. A module in this
 * repository is a domain with an HTTP surface — routes, an OpenAPI fragment, a docs page — and
 * tenancy has none of those: nothing in the boilerplate creates a shop over the wire. It is the
 * mechanism every domain is scoped BY, which is what the kernel is for, and it sits beside
 * `permissions.ts` and `ability.ts` because the three answer one question between them.
 *
 * ROLES ARE DATA, PERMISSIONS ARE CODE. That split is why `roles` is a collection and the keys it
 * holds are not: a deployment may rename a role, add one, or change what it grants, and none of
 * that is a code change. Inventing a KEY is, because a key nothing checks grants nothing while
 * looking like it grants something — `assertDeclared` refuses one on the way in.
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
 * One role, and the keys it holds.
 *
 * `tenantId` is `null` for a role every shop starts with — the presets — and set for one a single
 * shop invented for itself. That is what lets a deployment add `curator` to one association
 * without every other association growing a role nobody there uses.
 */
export interface RoleDocument extends Document {
    name: string;
    scope: AuthorizationScope;
    tenantId: string | null;
    permissions: string[];
    /** Seeded from `shared/authorization-roles.yaml`. Editable; deleting one is refused. */
    preset: boolean;
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

const roleSchema = new Schema<RoleDocument>(
    {
        name: { type: String, required: true, lowercase: true, trim: true },
        scope: { type: String, required: true, enum: ['tenant', 'platform'] },
        tenantId: { type: String, default: null },
        permissions: { type: [String], default: [] },
        preset: { type: Boolean, default: false }
    },
    { timestamps: true }
);

/*
 * One role name per scope per tenant. Spatie throws `RoleAlreadyExists` on the same collision and
 * for the same reason: two rows answering to one name is a grant nobody can reason about, and the
 * one that wins is whichever the driver returned first.
 */
roleSchema.index({ name: 1, scope: 1, tenantId: 1 }, { unique: true });

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

/** The role collection, typed for the store. */
export type RoleModel = Model<RoleDocument>;

/** The "who holds which role, where" collection, typed for the store. */
export type MembershipModel = Model<MembershipDocument>;

/** The shop rows. */
export const tenantModel: TenantModel = model<TenantDocument>('Tenant', tenantSchema);

/** The role rows — editable, which is what makes roles data rather than code. */
export const roleModel: RoleModel = model<RoleDocument>('Role', roleSchema);

/** The membership rows the resolver reads to answer "which role, in which scope". */
export const membershipModel: MembershipModel = model<MembershipDocument>(
    'Membership',
    membershipSchema
);
