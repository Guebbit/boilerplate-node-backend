/**
 * Money at rest (`persistence/money-field`) against a real database.
 *
 * What a mock cannot say, and these cases do: that the stored value IS a `Decimal128`, that a
 * hydrated read, a lean read and `toJSON` all hand back decimal text, that `toJSON` pads it to the
 * row's currency (also what `$inc` and `$sum` wrote), that a database `$sum`
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
    /** The top-level money amount, as decimal text. */
    amount: string;
    /** Its currency, when the model stores one per document. */
    currency?: string;
    /** A second top-level amount. */
    refunded?: string;
    /** Nested amounts, one per line. */
    lines: { price: string }[];
}

/** Schema of the throwaway model. */
const probeSchema = new Schema<Probe>({
    currency: { type: String, default: 'EUR' },
    amount: moneyPath({ required: true, nonNegative: true }),
    refunded: moneyPath({ nonNegative: true, default: '0' }),
    lines: {
        type: [new Schema({ price: moneyPath({ required: true }) }, { _id: false })],
        default: []
    }
});
probeSchema.plugin(moneyPlugin);
/** Schema of the throwaway model. */
const serialize = applySerialization(probeSchema);
/** A throwaway model, so the persistence helper is tested without a module. */
const probeModel = model<Probe>('MoneyProbe', probeSchema);

/** What the collection holds, with no Mongoose read path in between. */
const stored = (id: unknown): Promise<Record<string, unknown> | null> =>
    probeModel.collection.findOne({ _id: id as never });

describe('a money field', () => {
    it('is stored as a Decimal128 and read back as decimal text', async () => {
        const row = await probeModel.create({ amount: '19.99', lines: [{ price: '4.20' }] });

        const raw = await stored(row._id);
        expect(Reflect.get(raw?.amount as object, '_bsontype')).toBe('Decimal128');
        expect(String(raw?.amount)).toBe('19.99');
        const hydrated = await probeModel.findById(row._id);
        expect(hydrated?.amount).toBe('19.99');
        expect(hydrated?.lines[0].price).toBe('4.20');
        expect(hydrated?.refunded).toBe('0');
    });

    it('comes back as text from a lean read, a lean update and toJSON', async () => {
        const row = await probeModel.create({ amount: '19.99', lines: [{ price: '4.20' }] });

        const lean = await probeModel.findById(row._id).lean();
        const updated = await probeModel
            .findOneAndUpdate(
                { _id: row._id },
                { $set: { refunded: '5.5' } },
                { returnDocument: 'after' }
            )
            .lean();
        const lines = await probeModel.find({}).lean();

        expect(lean).toMatchObject({ amount: '19.99', lines: [{ price: '4.20' }] });
        expect(updated?.refunded).toBe('5.5');
        expect(lines.every(({ amount }) => typeof amount === 'string')).toBe(true);
        expect(row.toJSON()).toMatchObject({ amount: '19.99', lines: [{ price: '4.20' }] });
        expect(serialize({ ...lean })).toMatchObject({ amount: '19.99' });
    });

    it('sums exactly in the database, and reads as minor units without a float', async () => {
        await probeModel.create([{ amount: '0.10' }, { amount: '0.20' }]);

        const [row] = await probeModel.aggregate<{ total: unknown }>([
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        // A double sum is 0.30000000000000004; Decimal128 adds the cents exactly.
        expect(String(row.total)).toBe('0.30');
        expect(toMinorUnits(row.total, 'EUR')).toBe(30);
    });

    it('refuses a negative amount where the field says so, and a non-finite one anywhere', async () => {
        await expect(probeModel.create({ amount: '-1.00' })).rejects.toThrow(/non-negative/);
        // The message names the failing path, not the literal `{PATH}` token a function message cannot expand.
        await expect(probeModel.create({ amount: '-1.00' })).rejects.toThrow(/amount must be/);
        await expect(probeModel.create({ amount: 'NaN' })).rejects.toThrow();
        // A nested `price` may be negative (a discount line), so only the finite check refuses this.
        await expect(
            probeModel.create({ amount: '1.00', lines: [{ price: '-2.00' }] })
        ).resolves.toBeDefined();
        await expect(
            probeModel.create({ amount: '1.00', lines: [{ price: 'Infinity' }] })
        ).rejects.toThrow();
    });
});

describe('the canonical wire spelling', () => {
    it.each([
        ['EUR', '19.9', '1000', '19.90', '1000.00'],
        ['JPY', '1999', '1000', '1999', '1000'],
        ['KWD', '1.5', '10', '1.500', '10.000']
    ])(
        'pads %s to its own places, for a stored value, an $inc and a lean read',
        async (currency, amount, increment, paddedAmount, paddedRefunded) => {
            const row = await probeModel.create({ amount, currency, lines: [{ price: amount }] });
            // `$inc` is the write that forgets scale: the stored Decimal128 has no trailing zeros.
            await probeModel.updateOne({ _id: row._id }, { $inc: { refunded: Number(increment) } });

            const hydrated = await probeModel.findById(row._id);
            const lean = await probeModel.findById(row._id).lean();

            expect(hydrated?.toJSON()).toMatchObject({
                amount: paddedAmount,
                refunded: paddedRefunded,
                lines: [{ price: paddedAmount }]
            });
            expect(serialize({ ...lean })).toMatchObject({
                amount: paddedAmount,
                refunded: paddedRefunded
            });
        }
    );

    it('pads a summed total as the same string a stored amount would be', async () => {
        // Stored without trailing zeros, so the `$sum` answers `0.3`.
        await probeModel.create([{ amount: '0.1' }, { amount: '0.2' }]);

        const [row] = await probeModel.aggregate<{ total: unknown }>([
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        // The scale `$sum` kept is `0.3`; the wire spelling is the currency's `0.30`.
        expect(serialize({ amount: row.total, currency: 'EUR' })).toMatchObject({ amount: '0.30' });
    });
});
