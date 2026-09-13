/**
 * @module
 * The one collection this module owns: `apikeys`, one document per minted machine-to-machine
 * credential. The secret itself is never stored — only `hash`, a sha256 digest (see
 * `./credentials`) — so a database leak alone can never forge a credential.
 *
 * See: docs/reference/data.md
 */

import { model, Schema } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { applySerialization } from '@infrastructure/persistence/serialize';

/** One minted machine-to-machine credential. */
export interface ApiKeyDocument extends Document {
    tenant: string;
    name: string;
    publicPrefix: string;
    hash: string;
    permissions: string[];
    createdByUserId: string;
    lastUsedAt?: Date;
    expiresAt?: Date;
    revokedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

/** Mongoose model type for {@link ApiKeyDocument}. */
export type ApiKeyModel = Model<ApiKeyDocument>;

/** Credential collection schema. */
export const apiKeySchema = new Schema<ApiKeyDocument, ApiKeyModel>(
    {
        // The organisation this key belongs to — same field, same reasoning as
        // `webhooks/model.ts`'s own `tenant` column. See docs/theory/tenancy.md's glossary for
        // the OTHER "tenant" in this codebase, `locales/model.ts`'s translation keyspace.
        tenant: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        // `unique: true` is a database fact, not just an index: two credentials sharing a prefix
        // would make `findActiveByPrefix` ambiguous about which hash to verify against.
        publicPrefix: {
            type: String,
            required: true,
            unique: true
        },
        hash: {
            type: String,
            required: true
        },
        permissions: {
            type: [String],
            required: true,
            validate: {
                validator: (value: string[]) => value.length > 0,
                message: 'A credential must hold at least one permission.'
            }
        },
        createdByUserId: {
            type: String,
            required: true
        },
        lastUsedAt: {
            type: Date
        },
        expiresAt: {
            type: Date
        },
        revokedAt: {
            type: Date
        }
    },
    { timestamps: true }
);

// "This tenant's credentials, newest first" — the admin list's own read.
apiKeySchema.index({ tenant: 1, createdAt: -1 });

/**
 * Wire shape: `_id` → `id`, drops `tenant` (implicit in who is asking), `hash` (never leaves this
 * module — a serialized credential must never be the thing an attacker reads to forge one) and
 * `createdByUserId` (an internal detail the audit trail carries via `actor_user_id`, not a field
 * this contract exposes).
 */
export const applyApiKeyTransform = applySerialization(apiKeySchema, {
    omit: ['tenant', 'hash', 'createdByUserId']
});

/** Credential model entrypoint. Collection name `apikeys`. */
export const apiKeyModel = model<ApiKeyDocument, ApiKeyModel>('ApiKey', apiKeySchema);
