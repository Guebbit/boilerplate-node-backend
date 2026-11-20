/**
 * `persistence/serialize` — the border between a stored document and a wire payload, as far as the
 * VALUE TYPES go: `toJSON` hands a presenter text for every date and id, the lean door hands a
 * reader the date objects it asked for. (The universal key guarantees are the property test's.)
 */
import { Schema, Types, model } from 'mongoose';
import { applySerialization } from '@infrastructure/persistence/serialize';

/** A document with a date and an id at the top, nested in a sub-record and in an array. */
const buildSchema = () => {
    const schema = new Schema({
        happenedAt: Date,
        owner: Schema.Types.ObjectId,
        releaseDate: Date,
        nested: { at: Date, by: Schema.Types.ObjectId },
        entries: [{ at: Date, by: Schema.Types.ObjectId }]
    });
    const transform = applySerialization(schema, {
        // Stands in for a model step that cuts a shop-day from a real date (orders, products).
        after: (serialized) => {
            if (serialized.releaseDate instanceof Date)
                serialized.releaseDate = serialized.releaseDate.toISOString().slice(0, 10);
        }
    });
    return { schema, transform };
};

/** The instant every date in these fixtures carries. */
const AT = new Date('2026-11-17T10:20:30.000Z');

/** The id every id in these fixtures carries. */
const OWNER = new Types.ObjectId('64b7f0c2a1b2c3d4e5f60718');

describe('applySerialization — toJSON door', () => {
    it('turns a date and an id into text at the top, nested and inside an array', () => {
        const { schema } = buildSchema();
        const probe = model('SerializeProbe', schema);

        const wire = new probe({
            happenedAt: AT,
            owner: OWNER,
            nested: { at: AT, by: OWNER },
            entries: [{ at: AT, by: OWNER }]
        }).toJSON<Record<string, unknown>>();

        expect(wire).toMatchObject({
            happenedAt: '2026-11-17T10:20:30.000Z',
            owner: '64b7f0c2a1b2c3d4e5f60718',
            nested: { at: '2026-11-17T10:20:30.000Z', by: '64b7f0c2a1b2c3d4e5f60718' },
            entries: [{ at: '2026-11-17T10:20:30.000Z', by: '64b7f0c2a1b2c3d4e5f60718' }]
        });
    });

    it('lets a model step still see a real date, so its shop-day stays YYYY-MM-DD', () => {
        const { schema } = buildSchema();
        const probe = model('SerializeProbeShopDay', schema);

        const wire = new probe({ releaseDate: AT }).toJSON<Record<string, unknown>>();

        expect(wire.releaseDate).toBe('2026-11-17');
    });
});

describe('applySerialization — lean door', () => {
    it('leaves dates as Date objects for the readers that compute with them', () => {
        const { transform } = buildSchema();

        const row = transform({ _id: OWNER, happenedAt: AT, nested: { at: AT } });

        expect(row.happenedAt).toBeInstanceOf(Date);
        expect(row.nested).toEqual({ at: AT });
    });
});
