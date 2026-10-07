/**
 * `strictQuery: 'throw'` (`applyMongooseDefaults`) against a real database.
 *
 * What it buys: a filter on a path the schema does not declare is refused instead of silently
 * dropped, so a typo cannot turn `find({ emial })` into "match everything". It does not touch
 * operators on declared paths.
 */
import mongoose, { model, Schema } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { applyMongooseDefaults } from '@infrastructure/runtime/mongoose-defaults';
import { localeEntryModel } from '@modules/locales/model';

setupTestDb();

/** A schema with one declared path, so `nope` is the undeclared one. */
const probeModel = model('StrictQueryProbe', new Schema({ name: String }));

describe('strictQuery', () => {
    it('is set to throw by the suite bootstrap', () => {
        expect(mongoose.get('strictQuery')).toBe('throw');
    });

    it('is idempotent', () => {
        applyMongooseDefaults();

        expect(mongoose.get('strictQuery')).toBe('throw');
    });

    it('refuses a find on an undeclared path with StrictModeError', async () => {
        await probeModel.create({ name: 'a' });

        await expect(probeModel.find({ nope: 'a' }).exec()).rejects.toMatchObject({
            name: 'StrictModeError'
        });
    });

    it('still accepts a declared path', async () => {
        await probeModel.create({ name: 'a' });

        await expect(probeModel.find({ name: 'a' }).exec()).resolves.toHaveLength(1);
    });

    it('refuses a locales bulkWrite whose filter names an undeclared path', async () => {
        await expect(
            localeEntryModel.bulkWrite([
                {
                    updateOne: {
                        filter: { locale: 'en', nope: 'x' },
                        update: { $set: { value: 'v' } },
                        upsert: true
                    }
                }
            ])
        ).rejects.toMatchObject({ name: 'StrictModeError' });
    });
});
