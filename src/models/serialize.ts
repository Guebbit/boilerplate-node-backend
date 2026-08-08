import type { ToObjectOptions } from 'mongoose';

/**
 * The one place a stored document becomes a wire payload.
 *
 * Every collection here owes the API the same three things: `_id` renamed to `id`, `__v` gone, and
 * nothing on the response that `openapi.yaml` does not declare — 95 of its schemas are
 * `additionalProperties: false`, so a stray `_id` is a contract violation the suite in
 * `tests/contract/` fails on, not a cosmetic detail.
 *
 * Two callers need that, and only one of them gets any help from Mongoose:
 *
 *   - `toJSON`, where `virtuals: true` already supplies `id` and `versionKey: false` already drops
 *     `__v`, leaving only the `_id` deletion to do;
 *   - `.lean()` and `.aggregate()`, which return raw BSON with no virtuals and no `toJSON` options
 *     applied, and so need all three steps performed by hand — see `normalize` in
 *     `@repositories/base`.
 *
 * One function serves both, which is why it still writes `id` and deletes `__v` even though the
 * `toJSON` path does not need either.
 */

/** A model's serializer: mutates a plain object into its wire shape and returns it. */
export type TSerializeTransform = (serialized: Record<string, unknown>) => Record<string, unknown>;

export interface ISerializeOptions {
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
 * `Schema<never>` rejects every real schema and `Schema<IProductDocument>` would only accept one
 * of the five. What the wiring actually touches is a single `set('toJSON', …)` call, so that is
 * what the signature asks for.
 */
interface ISerializableSchema {
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
    schema: ISerializableSchema,
    { dropId = false, omit = [], after, virtuals = true }: ISerializeOptions = {}
): TSerializeTransform => {
    const transform: TSerializeTransform = (serialized) => {
        if (dropId) delete serialized._id;
        else if (serialized._id) {
            serialized.id = serialized._id.toString();
            delete serialized._id;
        }
        delete serialized.__v;

        for (const key of omit) delete serialized[key];

        after?.(serialized);

        return serialized;
    };

    schema.set('toJSON', {
        virtuals,
        versionKey: false,
        transform: (_document, serialized) =>
            transform(serialized as unknown as Record<string, unknown>)
    });

    return transform;
};
