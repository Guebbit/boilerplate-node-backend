/**
 * @module
 * Image digesting — sharp wrapper. Two pure Buffer→Buffer transforms, `digestImage` and
 * `thumbnailImage`, both built on the same decode step. Everything sharp-shaped stays behind this
 * file: swapping the library later is a rewrite of these two functions, not a search across the
 * codebase.
 *
 * See: docs/tools/image-processing.md
 */

import sharp from 'sharp';
import type { Sharp } from 'sharp';
import { environmentNumber } from '@infrastructure/runtime/environment';

/**
 * The three formats an upload can declare, per `SUPPORTED_IMAGE_FORMATS` in `image-signatures.ts`.
 * `digestImage` re-encodes into the SAME one it is given — never converts — because the extension
 * on disk already picked the `Content-Type` `express.static` will send, and changing the bytes'
 * format without changing the extension recreates the exact mismatch the upload gates exist to
 * remove.
 */
export type ReencodableImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

/*
 * `registerWorkers()` runs in every cluster fork (src/app.ts), so without these two calls a
 * multi-core deployment runs N forks × sharp's own thread pool × libvips's own operation cache —
 * multiplying memory nobody asked for. `concurrency(1)` limits libvips to one thread per fork,
 * `cache(false)` disables its input/operation cache, which exists to speed up REPEATED operations
 * on the same image — a one-shot digest never benefits from it.
 */
sharp.concurrency(1);
sharp.cache(false);

/**
 * Ceiling on decoded pixel count, checked before any resize runs. sharp's own default is 268
 * megapixels; a 5 MB PNG can legally decode to gigabytes of raw pixels, so without an explicit,
 * smaller cap the decode step itself is the decompression bomb this pipeline exists to prevent.
 *
 * Read at call time, not frozen at import — every other adapter in this codebase reads its
 * environment lazily for the same reason (see `maxUploadBytes` in `storage.ts`): a value read
 * while this module is being evaluated can be fixed before `.env` has necessarily loaded.
 */
const maxInputPixels = (): number =>
    environmentNumber('NODE_IMAGE_MAX_INPUT_PIXELS', 50_000_000, 1);

/** Longest edge a digested original is allowed to keep. Smaller images are left alone. */
const maxDigestDimension = (): number => environmentNumber('NODE_IMAGE_MAX_DIMENSION', 2048, 1);

/** Longest edge a thumbnail is allowed to keep. */
const maxThumbnailDimension = (): number =>
    environmentNumber('NODE_IMAGE_THUMBNAIL_DIMENSION', 320, 1);

/**
 * Decode a buffer under the shared safety limits, and auto-orient it from its own EXIF tag.
 *
 * `rotate()` with no argument reads the embedded orientation once, bakes it into the pixels, and
 * — same as every other tag — the orientation tag itself is then dropped on output. Doing this
 * before the metadata strip is what keeps a portrait phone photo upright once the strip has run;
 * doing it after would have nothing left to read.
 *
 * @param input - the raw, undecoded bytes (a quarantined upload)
 * @throws When `input` is not a decodable image, or decodes past {@link maxInputPixels}.
 */
const decode = (input: Buffer): Sharp =>
    sharp(input, {
        // Pixel ceiling, not a byte ceiling — see maxInputPixels above.
        limitInputPixels: maxInputPixels()
    }).rotate();

/**
 * Re-encode a pipeline into one of the three accepted formats, and no other.
 *
 * A `switch` over a closed union rather than a lookup table: TypeScript proves every case is
 * handled, so a fourth format added to {@link ReencodableImageMime} without a branch here is a
 * compile error, not a silent pass-through to sharp's own default encoder.
 *
 * @param pipeline - a sharp pipeline already decoded and resized
 * @param mime - which of the three accepted formats to encode as
 */
const reencode = (pipeline: Sharp, mime: ReencodableImageMime): Sharp => {
    switch (mime) {
        case 'image/png': {
            return pipeline.png();
        }
        case 'image/jpeg': {
            return pipeline.jpeg();
        }
        case 'image/webp': {
            return pipeline.webp();
        }
    }
};

/**
 * Turn a quarantined upload into the bytes that get promoted to `public/`.
 *
 * Three things happen, all irreversible and all the point: metadata (EXIF GPS/serial/timestamp,
 * ICC profiles, XMP) is dropped because sharp omits it on output unless `withMetadata()` asks
 * otherwise — which nothing here does; dimensions are capped so a full-resolution camera photo
 * does not sit behind a URL forever at 40 MB; and re-encoding through libvips is what a shallow
 * magic-byte check cannot do — a payload smuggled in an ancillary PNG chunk does not survive a
 * decode/encode round trip, because nothing about that round trip reads or copies it forward.
 *
 * @param input - the quarantined file's raw bytes
 * @param mime - the format declared at upload time; the output is re-encoded into the SAME one
 * @returns the digested bytes, ready to promote to the public store
 * @throws When `input` will not decode as `mime`, or exceeds {@link maxInputPixels}.
 */
export const digestImage = (input: Buffer, mime: ReencodableImageMime): Promise<Buffer> =>
    reencode(
        decode(input).resize(maxDigestDimension(), maxDigestDimension(), {
            // Longest edge capped; the other shrinks to match, never cropped.
            fit: 'inside',
            // An image already smaller than the cap is left at its own resolution.
            withoutEnlargement: true
        }),
        mime
    ).toBuffer();

/**
 * Produce the thumbnail that accompanies a digested original.
 *
 * Always WebP regardless of the source format: a thumbnail lands at its own key
 * (`/images/thumbs/v1/<stem>.webp`), never at the original's URL, so nothing downstream infers a
 * `Content-Type` from an extension that disagrees with these bytes.
 *
 * @param input - the quarantined file's raw bytes (the same input `digestImage` receives)
 * @returns the thumbnail bytes, ready to store as a derivative
 * @throws When `input` will not decode, or exceeds {@link maxInputPixels}.
 */
export const thumbnailImage = (input: Buffer): Promise<Buffer> =>
    decode(input)
        .resize(maxThumbnailDimension(), maxThumbnailDimension(), {
            fit: 'inside',
            withoutEnlargement: true
        })
        .webp()
        .toBuffer();
