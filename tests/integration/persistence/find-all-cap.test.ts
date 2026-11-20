/**
 * `findAll` with no `limit` stops at 1000 rows: the backstop against an unbounded collection scan. Paging goes through `search`; this is what a
 * caller that forgot to page still gets. A scratch model, so the property is the factory's, not
 * any one module's.
 *
 * @see docs/understand/defences/denial-of-service.md#volume
 */
import { model, Schema, type Document } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { createRepository, type Wire } from '@infrastructure/persistence/create-repository';

setupTestDb();

/** One scalar is all a row needs. */
interface Probe extends Document {
    /** The row's ordinal, used to count what came back. */
    n: number;
}

/** A throwaway model, so the persistence helper is tested without a module. */
const probeModel = model<Probe>('FindAllCapProbe', new Schema<Probe>({ n: Number }));

/** A throwaway model, so the persistence helper is tested without a module. */
const probes = createRepository<Probe, Wire<Probe>>(probeModel, {
    transform: (item: Record<string, unknown>) => item,
    searchable: {}
});

describe('findAll without a limit', () => {
    it('returns at most 1000 rows, though more exist', async () => {
        // One past the ceiling: a backstop that is off by one would hand back all of them.
        await probeModel.insertMany(Array.from({ length: 1001 }, (_, n) => ({ n })));

        const rows = await probes.findAll();

        expect(rows).toHaveLength(1000);
    });

    it('honours a limit the caller names, over the ceiling', async () => {
        await probeModel.insertMany(Array.from({ length: 1001 }, (_, n) => ({ n })));

        const rows = await probes.findAll({}, { limit: 1001 });

        expect(rows).toHaveLength(1001);
    });
});

describe('findByIds', () => {
    it('returns every id, past the findAll default cap', async () => {
        // One past the ceiling: without a limit of its own the 1001st id would be dropped silently.
        const inserted = await probeModel.insertMany(
            Array.from({ length: 1001 }, (_, n) => ({ n }))
        );

        const rows = await probes.findByIds(inserted.map((row) => String(row._id)));

        expect(rows).toHaveLength(1001);
    });

    it('rejects a malformed id instead of throwing out of the call', async () => {
        await expect(probes.findByIds(['not-an-id'])).rejects.toThrow();
    });
});
