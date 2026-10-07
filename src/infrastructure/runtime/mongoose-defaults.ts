/**
 * @module
 * Mongoose settings that are frozen when a schema is built, so they must be set before any model
 * module loads. Kept free of other project imports: it sits on the first import line of every
 * entry point.
 */
import mongoose from 'mongoose';

/**
 * Make a filter on a path the schema does not declare an error instead of a silent no-op.
 *
 * Why: a typo'd path in a query filter is stripped by default, so `find({ emial })` matches
 * everything. `'throw'` raises `StrictModeError` instead. It does NOT stop operator injection
 * (`{ $ne: … }` on a declared path): that is a separate, parked hardening.
 *
 * Why before models: a `bulkWrite` filter reads the option as it was when the schema was built,
 * not when the query runs. Idempotent, so every entry point may call it.
 * https://mongoosejs.com/docs/guide.html#strictQuery
 * https://mongoosejs.com/docs/api/mongoose.html#Mongoose.prototype.set()
 */
export const applyMongooseDefaults = (): void => {
    mongoose.set('strictQuery', 'throw');
};
