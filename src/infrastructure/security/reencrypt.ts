/**
 * @module
 * Re-encrypts the stored secrets of one collection onto the newest key of their ring, so a key
 * rotation can finally retire the old key (NIST SP 800-57 cryptoperiods; Vault `rewrap` and AWS KMS
 * `ReEncrypt` are the same move). Nothing else re-encrypts an old row.
 *
 * Each owning module describes WHERE its encrypted fields are; this file does the batching, the
 * rewrap and the write. Run by the `reencrypt` ops script, through the owning modules' services.
 *
 * Batched:     pages by `_id`, so memory stays flat on a large collection.
 * Idempotent:  a value already on the newest key is not touched, so a second run writes nothing.
 * Safe:        each write is filtered on the value it read, so a concurrent edit of the same field
 *              wins and the row is picked up on the next run instead of being overwritten.
 * Quiet:       the driver's `bulkWrite`, below mongoose — no hooks, no `updatedAt`, no new ETag.
 *              Re-encrypting changes no content, only its envelope.
 */

import type { Document, Model, QueryFilter, mongo } from 'mongoose';
import { Types } from 'mongoose';
import {
    rewrapVersionedSecret,
    versionOf,
    type SecretBinding,
    type VersionedKey
} from './versioned-secret';

/** Rows read per round trip. */
const BATCH_SIZE = 200;

/** One encrypted value inside a document. */
export interface EncryptedField {
    /** Dotted path from the document root, e.g. `items.2.city`; used as the write target. */
    path: string;
    /** The stored ciphertext. */
    stored: string;
    /** What the value is bound to; must equal the binding it was written under. */
    binding: SecretBinding;
    /** The field's name in the report and in errors, e.g. `addressbooks.city`. */
    label: string;
}

/**
 * What one run found: how many values sat on each key version, per field, and how many it moved.
 * With `dryRun` the second number is always 0, the first is what a real run would act on.
 */
export interface ReencryptReport {
    /** `label` → key version → value count, counted BEFORE any move. */
    found: Record<string, Record<string, number>>;
    /** Values rewritten under the newest key. */
    rewritten: number;
}

/** What a module hands the engine to re-encrypt one collection. */
export interface ReencryptJob<TDocument extends Document> {
    /** The collection's model; read lean, written with `bulkWrite`. */
    model: Model<TDocument>;
    /** Narrows the read to documents that can hold a value (e.g. `{ phone: { $exists: true } }`). */
    filter?: object;
    /** Mongoose `select` for fields hidden by default (e.g. `+twoFactorMethods`). */
    select?: string;
    /** Every encrypted value one document holds. */
    fieldsOf: (document: TDocument & { _id: Types.ObjectId }) => EncryptedField[];
    /** The ring the values are written under; its first entry is the target. */
    ring: readonly VersionedKey[];
}

/** One write for the driver's `bulkWrite`. */
type BulkWrite = mongo.AnyBulkWriteOperation;

/** A {@link ReencryptJob} minus its model: what a module's service says, the repository adds the rest. */
export type ReencryptSpec<TDocument extends Document> = Omit<ReencryptJob<TDocument>, 'model'>;

/**
 * Binds the engine to one model — what a repository exposes as its `reencrypt` method, so the
 * model never leaves the repository.
 *
 * @param model - the collection's model
 */
export const reencryptOf =
    <TDocument extends Document>(model: Model<TDocument>) =>
    (spec: ReencryptSpec<TDocument>, dryRun = false): Promise<ReencryptReport> =>
        reencryptCollection({ ...spec, model }, dryRun);

/** A report with nothing in it yet. */
export const emptyReport = (): ReencryptReport => ({ found: {}, rewritten: 0 });

/**
 * Two reports as one: the per-field counts side by side (labels never collide across
 * collections) and the rewrites summed.
 */
export const mergeReports = (first: ReencryptReport, second: ReencryptReport): ReencryptReport => ({
    found: { ...first.found, ...second.found },
    rewritten: first.rewritten + second.rewritten
});

/** Adds one field to the tally of what was found. */
const tally = (report: ReencryptReport, field: EncryptedField): void => {
    const byVersion = (report.found[field.label] ??= {});
    const version = versionOf(field.stored);
    byVersion[version] = (byVersion[version] ?? 0) + 1;
};

/**
 * The write for one stale field, filtered on the ciphertext that was read.
 *
 * @param next - the value rewrapped under the newest key
 */
const writeOf = (id: Types.ObjectId, field: EncryptedField, next: string): BulkWrite => ({
    updateOne: {
        filter: { _id: id, [field.path]: field.stored },
        update: { $set: { [field.path]: next } }
    }
});

/**
 * Handles one page: tallies every field, and unless `dryRun`, rewraps the stale ones.
 *
 * @returns the writes to apply for this page
 */
const planPage = <TDocument extends Document>(
    page: (TDocument & { _id: Types.ObjectId })[],
    job: ReencryptJob<TDocument>,
    report: ReencryptReport,
    dryRun: boolean
): BulkWrite[] => {
    const writes: BulkWrite[] = [];
    for (const document of page)
        for (const field of job.fieldsOf(document)) {
            tally(report, field);
            const next = dryRun
                ? field.stored
                : rewrapVersionedSecret(field.stored, job.ring, field.binding, field.label);
            if (next !== field.stored) writes.push(writeOf(document._id, field, next));
        }
    return writes;
};

/**
 * Re-encrypts every value `job` describes onto the ring's newest key.
 *
 * @param job - where the collection's encrypted values are
 * @param dryRun - count what a real run would move, write nothing
 * @param cursor - the last `_id` already handled; internal, for the recursion over pages
 * @param report - the running tally; internal
 */
export const reencryptCollection = <TDocument extends Document>(
    job: ReencryptJob<TDocument>,
    dryRun = false,
    cursor?: Types.ObjectId,
    report: ReencryptReport = emptyReport()
): Promise<ReencryptReport> => {
    // Cast: `_id` paging on a generic document; every collection here has an ObjectId `_id`.
    const where = {
        ...job.filter,
        ...(cursor ? { _id: { $gt: cursor } } : {})
    } as QueryFilter<TDocument>;

    return job.model
        .find(where)
        .select(job.select ?? '')
        .sort({ _id: 1 })
        .limit(BATCH_SIZE)
        .lean<(TDocument & { _id: Types.ObjectId })[]>()
        .exec()
        .then((page) => {
            if (page.length === 0) return report;
            const writes = planPage(page, job, report, dryRun);
            const last = page.at(-1)!._id;
            const apply =
                writes.length > 0 ? job.model.collection.bulkWrite(writes) : Promise.resolve();
            return apply.then(() => {
                report.rewritten += writes.length;
                return page.length < BATCH_SIZE
                    ? report
                    : reencryptCollection(job, dryRun, last, report);
            });
        });
};
