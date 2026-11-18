/**
 * @module
 * The one place a stored document becomes a wire payload: `_id` → `id`, `__v` dropped, and nothing
 * beyond what `openapi.yaml` declares. Two callers need this and only one gets help from Mongoose
 * — `toJSON` already supplies `id`/drops `__v`, while `.lean()`/`.aggregate()` return raw BSON
 * needing all three steps by hand (see `normalize` in `create-repository.ts`) — so one function
 * serves both.
 */

import type { ToObjectOptions } from 'mongoose';
import { carryVersion } from './versioning';
import { EDIT_REVISION } from './revision-plugin';
import {
    moneyPathsOf,
    padMoneyPaths,
    stringifyDecimals,
    type MoneyWalkableSchema
} from './money-field';

/** A model's serializer: mutates a plain object into its wire shape and returns it. */
export type SerializeTransform = (serialized: Record<string, unknown>) => Record<string, unknown>;

/** What a model may customize about its own wire-shape transform, passed to {@link applySerialization}. */
export interface SerializeOptions {
    /**
     * Delete `_id` instead of renaming it to `id`.
     *
     * For collections with no addressable endpoint: exposing an id there would invite one to be
     * built. `audit-logs` is the only such collection.
     */
    dropId?: boolean;
    /** Top-level keys stripped after the shared steps — secrets, or fields the contract omits. */
    omit?: string[];
    /** Whatever else this model owes its contract: nested normalization, derived fields, formats. */
    after?: (serialized: Record<string, unknown>) => void;
    /** Whether `toJSON` includes Mongoose virtuals. Off only where no virtual is wanted. */
    virtuals?: boolean;
    /**
     * The currency every stored amount of this model is priced in; its money fields are padded to
     * that currency's places last. Default: the document's own `currency`. Products pass the live
     * shop currency, because a product stores none.
     */
    currency?: (serialized: Record<string, unknown>) => string | undefined;
}

/**
 * The one method this needs from a schema, named structurally.
 *
 * `Schema` can't be spelled as a parameter type here — its generics carry the document type, and
 * `Schema<ProductDocument>` would only accept one of five models — so this asks only for the
 * single `set('toJSON', …)` call the wiring actually uses.
 */
interface SerializableSchema extends MoneyWalkableSchema {
    set: (key: 'toJSON', value: ToObjectOptions) => unknown;
}

/**
 * Whether a value is a BSON `ObjectId`. Read by its `_bsontype` tag rather than `instanceof`, so it
 * does not depend on which copy of the BSON library built the value.
 */
const isObjectId = (value: unknown): value is { toHexString: () => string } =>
    typeof value === 'object' && value !== null && Reflect.get(value, '_bsontype') === 'ObjectId';

/**
 * Whether a value is a `Date`, whichever realm built it (a jest sandbox has its own `Date`).
 */
const isDate = (value: unknown): value is Date =>
    Object.prototype.toString.call(value) === '[object Date]';

/**
 * Turns every `Date` into its ISO text and every `ObjectId` into its hex text, at any depth, in
 * place. Both calls are the ones `JSON.stringify` makes on the wire (`Date#toJSON`, the id's own
 * hex), so the bytes sent do not change; what changes is that the value is already text when a
 * presenter casts it to the API type, not only after sending.
 *
 * Runs on the `toJSON` door only, after the model's own step, which still needs to see real dates
 * (it turns some into a shop-day). The lean/list door keeps its date objects: its readers call
 * `getTime()` on them (`users/services/purchase-hold.ts`).
 *
 * @param value - a serialized document, or any value nested in one
 * @returns `value` itself, or the text it was when it was a date or an id
 */
const textifyDatesAndIds = (value: unknown): unknown => {
    if (isDate(value)) return value.toJSON();
    if (isObjectId(value)) return value.toHexString();
    if (typeof value !== 'object' || value === null) return value;
    // Only plain objects and arrays hold nested values worth walking; a Buffer does not.
    if (!Array.isArray(value) && Object.prototype.toString.call(value) !== '[object Object]')
        return value;
    for (const [key, nested] of Object.entries(value)) {
        const text = textifyDatesAndIds(nested);
        if (text !== nested) Reflect.set(value, key, text);
    }
    return value;
};

/**
 * Build a model's transform and wire it into the schema's `toJSON`, in one call.
 *
 * Deliberately not a `schema.plugin()`: a plugin's return value is discarded, and the transform
 * has to come back out so the model can export it for the lean/aggregate path. Calling it directly
 * keeps both halves — the `toJSON` wiring and the exported serializer — on one line per model.
 */
export const applySerialization = (
    schema: SerializableSchema,
    { dropId = false, omit = [], after, virtuals = true, currency }: SerializeOptions = {}
): SerializeTransform => {
    const moneyPaths = moneyPathsOf(schema);
    /** The wire-shape transform itself — shared by both the `toJSON` path and the lean/aggregate path. */
    const transform: SerializeTransform = (serialized) => {
        if (dropId) delete serialized._id;
        else if (serialized._id) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- the narrower type is what tells `no-base-to-string` an ObjectId stringifies to its hex, not `[object Object]`
            serialized.id = String(serialized._id as { toString(): string });
            delete serialized._id;
        }
        delete serialized.__v;
        // A stored amount is a Decimal128; every reader above this layer wants its decimal text.
        stringifyDecimals(serialized);
        /**
         * The edit counter is the row's version, not part of its wire shape: it rides beside the
         * object (`carryVersion`) so the item and update controllers can still derive the `ETag`.
         */
        carryVersion(serialized, serialized);
        Reflect.deleteProperty(serialized, EDIT_REVISION);

        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- stripping the caller-named keys from a plain record is the whole job
        for (const key of omit) delete serialized[key];

        after?.(serialized);

        // Last, so `after` computes on exact text and nothing it adds escapes the currency's places.
        const priced = currency ? currency(serialized) : serialized.currency;
        if (moneyPaths.length > 0 && typeof priced === 'string')
            padMoneyPaths(serialized, moneyPaths, priced);

        return serialized;
    };

    schema.set('toJSON', {
        virtuals,
        versionKey: false,
        transform: (document, serialized) => {
            // `versionKey: false` already removed the counter from `serialized`; the document still has it.
            const revision: unknown = Reflect.get(document, EDIT_REVISION);
            if (typeof revision === 'number')
                Object.assign(serialized, { [EDIT_REVISION]: revision });
            // After the model's own step, which may still read real dates (a shop-day is cut from one).
            const wire = transform(serialized);
            textifyDatesAndIds(wire);
            return wire;
        }
    });

    return transform;
};
