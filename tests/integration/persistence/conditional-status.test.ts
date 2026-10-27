import { model, Schema } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { updateStatusIfIn } from '@infrastructure/persistence/conditional-status';

/**
 * `updateStatusIfIn` against a real database: the property is what mongod does with two racing
 * filtered writes, which a mock cannot show.
 */

setupTestDb();

/** The smallest thing with a status and a stamp. */
interface ProbeDocument {
    status: string;
    scope: string;
    stampedAt?: Date;
}

const probeModel = model<ProbeDocument>(
    'ConditionalStatusProbe',
    new Schema<ProbeDocument>({ status: String, scope: String, stampedAt: Date })
);

describe('updateStatusIfIn', () => {
    it('lets exactly one of two racing writes land', async () => {
        const probe = await probeModel.create({ status: 'pending', scope: 'a' });
        const race = () => updateStatusIfIn(probeModel, { _id: probe._id }, ['pending'], 'paid');

        const results = await Promise.all([race(), race()]);

        expect(results.filter(Boolean)).toHaveLength(1);
        const stored = await probeModel.findById(probe._id).exec();
        expect(stored?.status).toBe('paid');
    });

    it('writes the stamps in the same statement and returns the row as it now stands', async () => {
        const probe = await probeModel.create({ status: 'pending', scope: 'a' });
        const stampedAt = new Date('2026-01-01T00:00:00Z');

        const moved = await updateStatusIfIn(
            probeModel,
            { _id: probe._id },
            ['pending', 'held'],
            'paid',
            {
                set: { stampedAt }
            }
        );

        expect(moved?.status).toBe('paid');
        expect(moved?.stampedAt).toEqual(stampedAt);
    });

    it('matches nothing from another status or outside the scope', async () => {
        const probe = await probeModel.create({ status: 'shipped', scope: 'a' });

        await expect(
            updateStatusIfIn(probeModel, { _id: probe._id }, ['pending'], 'paid')
        ).resolves.toBeNull();
        await expect(
            updateStatusIfIn(probeModel, { _id: probe._id, scope: 'b' }, ['shipped'], 'delivered')
        ).resolves.toBeNull();
    });
});
