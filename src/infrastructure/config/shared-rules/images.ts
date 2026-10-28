/**
 * @module
 * The schema of `shared/rules/images.yaml`: the accepted image formats, identified by their
 * leading bytes, and the version segment thumbnails are filed under.
 *
 * Relative imports only: see `src/infrastructure/config/shared-rules/load.ts`.
 */

import { z } from 'zod';

/** Bytes a file must carry at an offset. */
const markerSchema = z.strictObject({
    /** Byte offset the marker starts at. */
    offset: z.int().min(0),
    /** The exact bytes. */
    bytes: z.array(z.int().min(0).max(255)).min(1)
});

/** One accepted format. Strict: an extra key is a typo, or a behaviour that belongs in code. */
export const imageFormatSchema = z.strictObject({
    /** The real MIME type, e.g. `image/png`. */
    mime: z.string().regex(/^image\/[a-z0-9.+-]+$/),
    /** Other `Content-Type` spellings clients send for it. */
    aliases: z
        .array(z.string().regex(/^image\/[a-z0-9.+-]+$/))
        .min(1)
        .optional(),
    /** Where the main signature starts. */
    offset: z.int().min(0),
    /** The main signature. */
    bytes: z.array(z.int().min(0).max(255)).min(1),
    /** The extension the file is stored under, without the dot. */
    extension: z.string().regex(/^[a-z0-9]+$/),
    /** Further markers that must also match. */
    alsoRequires: z.array(markerSchema).min(1).optional(),
    /** Whether the digest job can re-encode it. */
    reencodable: z.boolean()
});

/** Shape of `shared/rules/images.yaml`. */
export const imagesSchema = z.strictObject({
    images: z
        .strictObject({
            /** The version segment of every thumbnail path. */
            thumbnailVersion: z.string().regex(/^v[0-9]+$/),
            /** Every accepted format. */
            formats: z.array(imageFormatSchema).min(1)
        })
        .refine(
            ({ formats }) => {
                const mimes = formats.flatMap((format) => [format.mime, ...(format.aliases ?? [])]);
                return new Set(mimes).size === mimes.length;
            },
            { message: 'a MIME type or alias is listed twice' }
        )
});
