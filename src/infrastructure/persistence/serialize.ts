/**
 * @module
 * The one place a stored document becomes a wire payload: `_id` → `id`, `__v` dropped, and nothing
 * beyond what `openapi.yaml` declares — most of its schemas are `additionalProperties: false`, so a
 * stray `_id` fails the contract suite, not just looks untidy.
 *
 * Two callers need this, and only one gets help from Mongoose: `toJSON` already supplies `id` and
 * drops `__v` via schema options, needing just the `_id` deletion; `.lean()`/`.aggregate()` return
 * raw BSON with none of that applied, so they need all three steps by hand (see `normalize` in
 * `create-repository.ts`). One function serves both.
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
 * `Schema` cannot be spelled here as a parameter type: its generics carry the document type, so
 * `Schema<never>` rejects every real schema and `Schema<ProductDocument>` would only accept one
 * of the five. What the wiring actually touches is a single `set('toJSON', …)` call, so that is
 * what the signature asks for.
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
         * One `as`, not `as unknown as`. Mongoose types the copy it hands the transform from the
         * raw document type — unnamed here, so it arrives as `{ _id, __v? }` and nothing more.
         * That is a *narrower* type than the string-keyed bag the serializer works on, not an
         * unrelated one, so widening it takes a single step.
         */
        transform: (_document, serialized) => transform(serialized as Record<string, unknown>)
    });

    return transform;
};
