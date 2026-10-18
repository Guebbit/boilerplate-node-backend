/**
 * Money at rest (`persistence/money-field`) against a real database.
 *
 * What a mock cannot say, and these cases do: that the stored value IS a `Decimal128`, that a
 * hydrated read, a lean read and `toJSON` all hand back plain numbers, that a database `$sum`
 * adds cents exactly, and that a negative or non-finite amount is refused where the field says
 * so. A scratch model carries the plugin so the property is the plugin's, not any one module's.
 */
import { model, Schema } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { applySerialization } from '@infrastructure/persistence/serialize';
import { moneyPath, moneyPlugin } from '@infrastructure/persistence/money-field';
import { toMinorUnits } from '@domain-primitives/money';

setupTestDb();

/** One amount at the top level and one nested, enough to drive every read path. */
interface Probe {
    amount: number;
    refunded?: number;
    lines: { price: number }[];
}

const probeSchema = new Schema<Probe>({
    amount: moneyPath({ required: true, nonNegative: true }),
    refunded: moneyPath({ nonNegative: true, default: 0 }),
    lines: {
        type: [new Schema({ price: moneyPath({ required: true }) }, { _id: false })],
        default: []
    }
});
probeSchema.plugin(moneyPlugin);
const serialize = applySerialization(probeSchema);
const probeModel = model<Probe>('MoneyProbe', probeSchema);

/** What the collection holds, with no Mongoose read path in between. */
const stored = (id: unknown): Promise<Record<string, unknown> | null> =>
    probeModel.collection.findOne({ _id: id as never });

describe('a money field', () => {
    it('is stored as a Decimal128 and read back as a number', async () => {
        const row = await probeModel.create({ amount: 19.99, lines: [{ price: 4.2 }] });

        const raw = await stored(row._id);
        expect(Reflect.get(raw?.amount as object, '_bsontype')).toBe('Decimal128');
        expect(String(raw?.amount)).toBe('19.99');
        const hydrated = await probeModel.findById(row._id);
        expect(hydrated?.amount).toBe(19.99);
        expect(hydrated?.lines[0].price).toBe(4.2);
        expect(hydrated?.refunded).toBe(0);
    });

    it('comes back as numbers from a lean read, a lean update and toJSON', async () => {
        const row = await probeModel.create({ amount: 19.99, lines: [{ price: 4.2 }] });

        const lean = await probeModel.findById(row._id).lean();
        const updated = await probeModel
            .findOneAndUpdate(
                { _id: row._id },
                { $set: { refunded: 5.5 } },
                { returnDocument: 'after' }
            )
            .lean();
        const lines = await probeModel.find({}).lean();

        expect(lean).toMatchObject({ amount: 19.99, lines: [{ price: 4.2 }] });
        expect(updated?.refunded).toBe(5.5);
        expect(lines.every(({ amount }) => typeof amount === 'number')).toBe(true);
        expect(row.toJSON()).toMatchObject({ amount: 19.99, lines: [{ price: 4.2 }] });
        expect(serialize({ ...lean })).toMatchObject({ amount: 19.99 });
    });

    it('sums exactly in the database, and reads as minor units without a float', async () => {
        await probeModel.create([{ amount: 0.1 }, { amount: 0.2 }]);

        const [row] = await probeModel.aggregate<{ total: unknown }>([
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        // A double sum is 0.30000000000000004.
        expect(String(row.total)).toBe('0.3');
        expect(toMinorUnits(row.total, 'EUR')).toBe(30);
    });

    it('refuses a negative amount where the field says so, and a non-finite one anywhere', async () => {
        await expect(probeModel.create({ amount: -1 })).rejects.toThrow(/non-negative/);
        await expect(probeModel.create({ amount: NaN })).rejects.toThrow();
        // A nested `price` may be negative (a discount line), so only the finite check refuses this.
        await expect(
            probeModel.create({ amount: 1, lines: [{ price: -2 }] })
        ).resolves.toBeDefined();
        await expect(
            probeModel.create({ amount: 1, lines: [{ price: Infinity }] })
        ).rejects.toThrow();
    });
});
