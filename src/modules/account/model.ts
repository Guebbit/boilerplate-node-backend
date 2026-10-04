/**
 * @module
 * The one collection this module owns: `accountexports`, one document per account that asked for
 * its data. The row says whose export it is and how far the build got; the file itself is in the
 * private export store (`@infrastructure/adapters/export-store`), named by `file`.
 *
 * Never serialized to the wire: the contract's `AccountExportRequest` is built from it by hand,
 * and nothing here is a field a client may read.
 *
 * See: docs/modules/account.md#data-export
 */

import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';

/** How far an export got. `building` until the worker settles it, then one of the other two. */
export const EXPORT_STATUSES = ['building', 'ready', 'failed'] as const;

/** One of {@link EXPORT_STATUSES}. */
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

/** One account's export. */
export interface AccountExportDocument extends Document {
    userId: Types.ObjectId;
    status: ExportStatus;
    /** The file's name in the export store — the row's own id plus `.json`. */
    file: string;
    /** When the request was made — what a `building` row's age is measured from. */
    createdAt: Date;
    /** When the reaper deletes the row and its file. Pushed forward once the build is ready. */
    expiresAt: Date;
}

/** Queries live in `./repository`. */
export type AccountExportModel = Model<AccountExportDocument>;

/**
 * `unique: true` on `userId`: one live export per account is a database fact, so two simultaneous
 * requests cannot both create a row.
 */
export const accountExportSchema = new Schema<AccountExportDocument, AccountExportModel>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        status: { type: String, enum: [...EXPORT_STATUSES], required: true },
        file: { type: String, required: true },
        createdAt: { type: Date, required: true },
        expiresAt: { type: Date, required: true }
    },
    // No `timestamps`: `createdAt` is set by the request, and `expiresAt` is moved on purpose.
    { timestamps: false }
);

// The reaper's read: every row due for deletion.
accountExportSchema.index({ expiresAt: 1 });

/** The compiled Mongoose model — what `./repository` queries against. Collection `accountexports`. */
export const accountExportModel = model<AccountExportDocument, AccountExportModel>(
    'AccountExport',
    accountExportSchema
);
