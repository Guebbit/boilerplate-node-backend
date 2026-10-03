/**
 * The edit counter (`persistence/revision-plugin`) against a real database.
 *
 * What a mock cannot say, and these cases do: that the counter moves by a server-side `$inc` (two
 * writers cannot both read N and both write N+1), that it moves wherever `updatedAt` moves and
 * nowhere else, and that it works through every form of write the repositories use. A scratch
 * model carries the plugin so the property is the plugin's, not any one module's.
 */
import { model, Schema } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { applySerialization } from '@infrastructure/persistence/serialize';
import { EDIT_REVISION, revisionPlugin } from '@infrastructure/persistence/revision-plugin';
import { versionOf } from '@infrastructure/persistence/versioning';

setupTestDb();

/** A document with one scalar and one array — enough to drive every write form. */
interface Probe {
    name: string;
    tags: string[];
}

const probeSchema = new Schema<Probe>(
    { name: { type: String, required: true }, tags: { type: [String], default: [] } },
    { timestamps: true }
);
probeSchema.plugin(revisionPlugin);
const transform = applySerialization(probeSchema);
const probeModel = model<Probe>('RevisionProbe', probeSchema);

/** The stored counter of a row, read straight off the collection. */
const storedRevision = (id: unknown): Promise<unknown> =>
    probeModel
        .findById(id)
        .lean<Record<string, unknown>>()
        .then((row) => row?.[EDIT_REVISION]);

describe('editRevision', () => {
    it('starts a new row at 0, and has no __v', async () => {
        const row = await probeModel.create({ name: 'a' });

        expect(await storedRevision(row._id)).toBe(0);
        expect(await probeModel.findById(row._id).lean()).not.toHaveProperty('__v');
    });

    it('moves by exactly one for a save() that edits, in the database and in memory', async () => {
        const row = await probeModel.create({ name: 'a' });
        row.name = 'b';

        await row.save();

        expect(await storedRevision(row._id)).toBe(1);
        expect(versionOf(row)).toBe(1);
    });

    it('does not lose an increment when two writers hold the same copy (no If-Match needed)', async () => {
        const created = await probeModel.create({ name: 'a' });
        const first = await probeModel.findById(created._id);
        const second = await probeModel.findById(created._id);
        first!.name = 'first';
        second!.name = 'second';

        await Promise.all([first!.save(), second!.save()]);

        // Both landed (last writer wins) and the counter saw BOTH: no row ever shows a tag twice.
        expect(await storedRevision(created._id)).toBe(2);
    });

    it('does not move for a save() with nothing to write', async () => {
        const row = await probeModel.create({ name: 'a' });

        await row.save();

        expect(await storedRevision(row._id)).toBe(0);
    });

    it('does not move for a save() that opts out of timestamps', async () => {
        const row = await probeModel.create({ name: 'a' });
        row.name = 'b';

        await row.save({ timestamps: false });

        expect(await storedRevision(row._id)).toBe(0);
    });

    it('moves for a save() whose only change is marking updatedAt, as the role-only edit does', async () => {
        const row = await probeModel.create({ name: 'a' });
        row.markModified('updatedAt');

        await row.save();

        expect(await storedRevision(row._id)).toBe(1);
    });

    it.each([
        [
            'updateOne',
            (id: unknown) => probeModel.updateOne({ _id: id }, { $set: { name: 'b' } }).exec()
        ],
        [
            'updateMany',
            (id: unknown) => probeModel.updateMany({ _id: id }, { $push: { tags: 'x' } }).exec()
        ],
        [
            'findOneAndUpdate',
            (id: unknown) => probeModel.findOneAndUpdate({ _id: id }, { name: 'b' }).exec()
        ],
        [
            'an update pipeline',
            (id: unknown) =>
                probeModel
                    .updateOne({ _id: id }, [{ $set: { name: 'b' } }], { updatePipeline: true })
                    .exec()
        ]
    ])('moves for %s', async (_form, write) => {
        const row = await probeModel.create({ name: 'a' });

        await write(row._id);

        expect(await storedRevision(row._id)).toBe(1);
    });

    it('does not move for a query update that opts out of timestamps', async () => {
        const row = await probeModel.create({ name: 'a' });

        await probeModel
            .updateOne({ _id: row._id }, { $set: { name: 'b' } }, { timestamps: false })
            .exec();

        expect(await storedRevision(row._id)).toBe(0);
    });

    it('moves for an update that stamps updatedAt by hand with timestamps off, as markEdited does', async () => {
        const row = await probeModel.create({ name: 'a' });

        await probeModel
            .updateOne({ _id: row._id }, { $set: { updatedAt: new Date() } }, { timestamps: false })
            .exec();

        expect(await storedRevision(row._id)).toBe(1);
    });

    it('stays out of the wire shape but travels with it, hydrated and lean alike', async () => {
        const row = await probeModel.create({ name: 'a' });
        await probeModel.updateOne({ _id: row._id }, { $set: { name: 'b' } }).exec();
        const hydrated = await probeModel.findById(row._id);
        const lean = await probeModel.findById(row._id).lean<Record<string, unknown>>();

        const fromDocument = hydrated!.toJSON();
        const fromLean = transform({ ...lean! });

        expect(fromDocument).not.toHaveProperty(EDIT_REVISION);
        expect(fromLean).not.toHaveProperty(EDIT_REVISION);
        expect(versionOf(fromDocument)).toBe(1);
        expect(versionOf(fromLean)).toBe(1);
    });
});
