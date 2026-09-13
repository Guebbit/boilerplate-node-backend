/*
 * The data-migration ledger: what ran, when, and against what file contents.
 *
 * A data change (a rename, a backfill, a de-dupe) is an EVENT, not a state `db:sync` can
 * re-derive — see docs/reference/data.md. This is the record of which ones already happened,
 * split from `db/apply-data.ts` so directory scanning and checksumming are testable without a
 * database connection — the same reason `index-sync.ts` was split from `sync-indexes.ts`.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';
import type { Db } from 'mongodb';

/** Where every data-change script lives — naming convention documented in docs/reference/data.md. */
export const DATA_DIR = path.join(__dirname, '..', 'ops', 'data');

/** The ledger's own collection. `db:sync` never sees it — nothing here is an index. */
const COLLECTION = 'datachangelog';

/** One applied data change, as stored in `datachangelog`. */
export interface DataChangeRecord {
    file: string;
    appliedAt: Date;
    durationMs: number;
    checksum: string;
    host: string;
}

/** A data-change script's required shape — one function, given the native driver only. */
export interface DataChangeModule {
    up: (database: Db) => Promise<void>;
}

/**
 * Every `<timestamp>-<slug>.ts` file under `directory`, oldest first — the filename IS the order.
 *
 * @param directory - override for tests; production callers take the default `DATA_DIR`
 */
export const listMigrationFiles = (directory: string = DATA_DIR): string[] => {
    try {
        return readdirSync(directory)
            .filter((name) => name.endsWith('.ts'))
            .toSorted();
    } catch (error: unknown) {
        // ENOENT means "no data change has ever been added" — an empty ledger, not a failure.
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }
};

/** SHA-256 of a file's contents, hex-encoded — what catches a script edited after it ran. */
export const fileChecksum = (filePath: string): string =>
    createHash('sha256').update(readFileSync(filePath)).digest('hex');

/** A file on disk the ledger has never recorded, or one recorded under a different checksum. */
export interface PendingChange {
    file: string;
    checksum: string;
    /** Set only for `changed` — the checksum the ledger holds for this same filename. */
    previousChecksum?: string;
}

/**
 * Compare the files on disk against the ledger's records.
 *
 * @param applied - every record `readLedger` returned, keyed by filename
 * @param directory - override for tests; production callers take the default `DATA_DIR`
 * @returns files never applied, and files applied under a checksum that no longer matches — the
 *          two cases `db/apply-data.ts --check` refuses a deploy over, for different reasons
 */
export const diffMigrations = (
    applied: ReadonlyMap<string, DataChangeRecord>,
    directory: string = DATA_DIR
): { pending: PendingChange[]; changed: PendingChange[] } => {
    const pending: PendingChange[] = [];
    const changed: PendingChange[] = [];

    for (const file of listMigrationFiles(directory)) {
        const checksum = fileChecksum(path.join(directory, file));
        const record = applied.get(file);

        if (!record) pending.push({ file, checksum });
        else if (record.checksum !== checksum)
            changed.push({ file, checksum, previousChecksum: record.checksum });
    }

    return { pending, changed };
};

/** Every record the ledger holds, keyed by filename. */
export const readLedger = (database: Db): Promise<Map<string, DataChangeRecord>> =>
    database
        .collection<DataChangeRecord>(COLLECTION)
        .find()
        .toArray()
        .then((records) => new Map(records.map((record) => [record.file, record])));

/**
 * Append one applied change. `file` is the natural key — a second insert for it is a bug to
 * surface, not a retry to swallow, which is what the unique index from {@link ensureLedgerIndex}
 * is for.
 */
export const recordApplied = (database: Db, record: DataChangeRecord): Promise<unknown> =>
    database.collection<DataChangeRecord>(COLLECTION).insertOne(record);

/**
 * The ledger's own uniqueness guarantee. `datachangelog` has no Mongoose model — `up(db: Db)`'s
 * whole point is driver-level access — so `db:sync`'s reconciliation never reaches it; this is the
 * one place that creates its index, and it is idempotent to call on every run.
 */
export const ensureLedgerIndex = (database: Db): Promise<string> =>
    database.collection(COLLECTION).createIndex({ file: 1 }, { unique: true });

/** This host's identity for the ledger's `host` field — which container actually ran it. */
export const currentHost = (): string => hostname();
