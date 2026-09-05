/**
 * @module
 * The one place a stored document becomes a wire payload: `_id` → `id`, `__v` dropped, and nothing
 * beyond what `openapi.yaml` declares. Two callers need this and only one gets help from Mongoose
 * — `toJSON` already supplies `id`/drops `__v`, while `.lean()`/`.aggregate()` return raw BSON
 * needing all three steps by hand (see `normalize` in `create-repository.ts`) — so one function
 * serves both.
 */

import type { ToObjectOptions } from 'mongoose';

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
}

/**
 * The one method this needs from a schema, named structurally.
 *
 * `Schema` can't be spelled as a parameter type here — its generics carry the document type, and
 * `Schema<ProductDocument>` would only accept one of five models — so this asks only for the
 * single `set('toJSON', …)` call the wiring actually uses.
 */
interface SerializableSchema {
    set: (key: 'toJSON', value: ToObjectOptions) => unknown;
}

/**
 * Build a model's transform and wire it into the schema's `toJSON`, in one call.
 *
 * Deliberately not a `schema.plugin()`: a plugin's return value is discarded, and the transform
 * has to come back out so the model can export it for the lean/aggregate path. Calling it directly
 * keeps both halves — the `toJSON` wiring and the exported serializer — on one line per model.
 */
export const applySerialization = (
    schema: SerializableSchema,
    { dropId = false, omit = [], after, virtuals = true }: SerializeOptions = {}
): SerializeTransform => {
    /** The wire-shape transform itself — shared by both the `toJSON` path and the lean/aggregate path. */
    const transform: SerializeTransform = (serialized) => {
        if (dropId) delete serialized._id;
        else if (serialized._id) {
            serialized.id = String(serialized._id as { toString(): string });
            delete serialized._id;
        }
        delete serialized.__v;

        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- stripping the caller-named keys from a plain record is the whole job
        for (const key of omit) delete serialized[key];

        after?.(serialized);

        return serialized;
    };

    schema.set('toJSON', {
        virtuals,
        versionKey: false,
        /*
         * One `as`, not `as unknown as`: Mongoose hands the transform `{ _id, __v? }`, a
         * *narrower* type than the serializer's string-keyed bag — widening it is a single step.
         */
        transform: (_document, serialized) => transform(serialized as Record<string, unknown>)
    });

    return transform;
};
