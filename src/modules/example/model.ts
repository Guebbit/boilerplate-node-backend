/**
 * @module
 * In any module: the Mongoose schema, one collection, and the wire-shape transform the repository
 * and presenter share. Here: an example is a note with an owner, a status and an optional cover.
 *
 * See: docs/theory/layers.md
 */

import { model, Schema, type Document, type Model, type Types } from 'mongoose';
import { ExampleStatus, type Example } from '@types';
import { revisionPlugin } from '@infrastructure/persistence/revision-plugin';
import { applySerialization } from '@infrastructure/persistence/serialize';

/**
 * What the contract's `Example` is minus what only the presenter can fill (`ownerName`, read from
 * `users`) — the shape every repository read answers with.
 */
export type ExampleRow = Omit<Example, 'ownerName'>;

/**
 * Mongoose document type for examples. Overrides the generated type's `id` and its string dates
 * (Mongoose holds native ones; the JSON response turns them back into ISO strings), and carries
 * the owner as the ObjectId the collection stores.
 */
export interface ExampleDocument
    extends
        Omit<ExampleRow, 'id' | 'userId' | 'publishedAt' | 'createdAt' | 'updatedAt'>,
        Document {
    userId: Types.ObjectId;
    publishedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
    /**
     * Document-only bookkeeping for the image digest pipeline: the quarantine key of an upload
     * still waiting for its job. Never on the wire — see `omit` below.
     */
    pendingImageKey?: string;
}

/** Mongoose model type for {@link ExampleDocument}. */
export type ExampleModel = Model<ExampleDocument>;

/** Example collection schema. */
export const exampleSchema = new Schema<ExampleDocument, ExampleModel>(
    {
        userId: { type: Schema.Types.ObjectId, required: true },
        // The fallback-language title. Other languages live in `locales`' translation rows, and a
        // fallback-language write is copied back here (`repository.writeTranslatedFields`).
        title: { type: String, required: true },
        body: { type: String, required: true },
        status: {
            type: String,
            enum: Object.values(ExampleStatus),
            default: ExampleStatus.draft
        },
        publishedAt: { type: Date },
        imageUrl: { type: String },
        thumbnailUrl: { type: String },
        pendingImageKey: { type: String }
    },
    { timestamps: true }
);

/**
 * The edit counter behind this resource's `ETag` and `If-Match` — see `@infrastructure/persistence/revision-plugin`.
 */
exampleSchema.plugin(revisionPlugin);

// The list screen: one owner's examples, newest first.
exampleSchema.index({ userId: 1, createdAt: -1 });

/**
 * Normalizes a serialized example: `_id` to `id`, `__v` dropped, the owner as its hex string, the
 * bookkeeping key removed. Exported so lean results (which bypass `toJSON`) go through the same
 * logic — see `./repository`.
 */
export const applyExampleTransform = applySerialization(exampleSchema, {
    omit: ['pendingImageKey'],
    after: (serialized) => {
        serialized.userId = String(serialized.userId);
    }
});

/** Example model entrypoint. */
export const exampleModel = model<ExampleDocument, ExampleModel>('Example', exampleSchema);
