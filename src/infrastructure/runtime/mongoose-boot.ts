/**
 * @module
 * Import for its side effect, as the first project import of an entry point: applies the Mongoose
 * defaults before any model module is evaluated. A call after the imports would be too late,
 * because ES imports are hoisted above it. See {@link applyMongooseDefaults}.
 */
import { applyMongooseDefaults } from './mongoose-defaults';

applyMongooseDefaults();
