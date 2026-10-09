import { setupTestDb } from '@tests/setup-test-db';
import { leaseModel } from '@infrastructure/persistence/lease';
import { databaseOperationDuration } from '@infrastructure/persistence/command-metrics';

/**
 * The command histogram against a real driver: it must see a call that bypasses every repository
 * (a direct `Model.updateOne`), under that call's own collection, and tell a failure from a success.
 */

setupTestDb();

/** Observations recorded for one label combination so far. */
const observations = (labels: {
    collection: string;
    operation: string;
    outcome: string;
}): Promise<number> =>
    databaseOperationDuration
        .get()
        .then(
            ({ values }) =>
                values.find(
                    ({ metricName, labels: sample }) =>
                        metricName === 'db_client_operation_duration_seconds_count' &&
                        Object.entries(labels).every(
                            ([key, value]) => (sample as Record<string, unknown>)[key] === value
                        )
                )?.value ?? 0
        );

describe('database command metrics', () => {
    it('observes a direct Model.updateOne under its own collection', async () => {
        const labels = {
            collection: leaseModel.collection.name,
            operation: 'update',
            outcome: 'success'
        };
        const before = await observations(labels);

        await leaseModel.updateOne({ _id: 'command-metrics.ok' }, { $set: { holder: 'a' } });

        expect(await observations(labels)).toBe(before + 1);
    });

    it('records a rejected command with outcome error', async () => {
        const labels = {
            collection: leaseModel.collection.name,
            operation: 'aggregate',
            outcome: 'error'
        };
        const before = await observations(labels);

        // An unknown pipeline stage: the server answers ok:0, which the driver reports as a failed
        // command. (A duplicate-key insert would not do: that is ok:1 with a write error inside.)
        await expect(
            leaseModel.collection.aggregate([{ $noSuchStage: {} }]).toArray()
        ).rejects.toThrow();

        expect(await observations(labels)).toBe(before + 1);
    });
});
