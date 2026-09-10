/**
 * The ledger's database-side half: the collection `datachangelog` actually is, and the uniqueness
 * guarantee `ensureLedgerIndex` is responsible for since `db:sync` never reaches this collection —
 * it has no Mongoose model, by design (`up(db: Db)`'s whole point is driver-level access).
 *
 * See: docs/reference/data.md
 */
import mongoose from 'mongoose';
import type { Db } from 'mongodb';
import { connect, disconnect } from '@tests/database';
import {
    currentHost,
    ensureLedgerIndex,
    readLedger,
    recordApplied,
    type DataChangeRecord
} from '../../../db/data-changelog';

/** The native handle, since the ledger is driver-level by design. */
const nativeDb = (): Db => {
    const { db } = mongoose.connection;
    if (!db) throw new Error('no database handle — the test connection is not open');
    return db;
};

const record = (file: string, checksum = 'checksum'): DataChangeRecord => ({
    file,
    checksum,
    appliedAt: new Date(),
    durationMs: 1,
    host: currentHost()
});

beforeAll(connect);
afterAll(disconnect);

describe('the data-migration ledger', () => {
    it('records an applied file and reads it back keyed by filename', async () => {
        await ensureLedgerIndex(nativeDb());
        await recordApplied(nativeDb(), record('20260101000000-a.ts'));

        const ledger = await readLedger(nativeDb());

        expect(ledger.get('20260101000000-a.ts')).toMatchObject({ file: '20260101000000-a.ts' });
    });

    it('refuses a second record for the same filename', async () => {
        await ensureLedgerIndex(nativeDb());
        await recordApplied(nativeDb(), record('20260101000000-b.ts'));

        await expect(recordApplied(nativeDb(), record('20260101000000-b.ts'))).rejects.toThrow();
    });

    it('is idempotent to call twice, the same way db:sync calling syncIndexes repeatedly is', async () => {
        await ensureLedgerIndex(nativeDb());
        await expect(ensureLedgerIndex(nativeDb())).resolves.not.toThrow();
    });
});
