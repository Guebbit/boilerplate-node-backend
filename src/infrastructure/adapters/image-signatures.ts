/**
 * @module
 * Content-based image identification. `Content-Type` on an upload is whatever the client wrote —
 * trivially spoofable — so the type is decided by the leading bytes instead, which a format's
 * spec fixes. It matters because of what reads the file later: a static server labelling by
 * extension, an SVG carrying `<script>`, or a decoder handed attacker-controlled input.
 * Deliberately not a dependency (`file-type` et al): three signatures is easier to audit inline
 * than to trust.
 */

import { open } from 'node:fs/promises';

/**
 * One accepted image format: its real MIME type, any alias spelling a client may declare, the
 * exact bytes it must begin with, and the extension it's stored under. The single source of
 * truth for "what formats does this API accept" — `ACCEPTED_UPLOAD_MIMETYPES` in `storage.ts`
 * derives from this list too, so adding a format is one entry here, not three.
 */
interface ImageFormat {
    /** The real MIME type, e.g. `image/png`. */
    mime: string;
    /** Other `Content-Type` spellings clients send for this format (e.g. the non-IANA `image/jpg`). */
    aliases?: readonly string[];
    /** Byte offset the signature starts at — 0 for most formats, but WebP's marker sits after the RIFF header. */
    offset: number;
    /** The exact leading bytes this format's signature must match, starting at `offset`. */
    bytes: readonly number[];
    /** The file extension this format is stored under. */
    extension: string;
}

/**
 * Raster formats only. No SVG: it is XML that browsers execute, so accepting it means accepting
 * script upload, and no amount of sniffing makes that safe.
 */
const SUPPORTED_IMAGE_FORMATS: readonly ImageFormat[] = [
    // \x89PNG\r\n\x1a\n — the trailing bytes exist to catch transfers that mangled line endings,
    // which is exactly why matching all eight is worth more than matching the first four.
    {
        mime: 'image/png',
        offset: 0,
        bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        extension: 'png'
    },
    // SOI marker plus the first byte of the next marker. JPEG has no longer fixed prefix: what
    // follows varies by encoder (JFIF, Exif, raw), so three bytes is the honest maximum.
    // 'image/jpg' is not a real IANA type, but enough clients send it that rejecting it would be
    // rejecting valid JPEGs over a spelling mistake.
    {
        mime: 'image/jpeg',
        aliases: ['image/jpg'],
        offset: 0,
        bytes: [0xff, 0xd8, 0xff],
        extension: 'jpg'
    },
    // 'WEBP', at offset 8, inside a RIFF container. The RIFF magic alone would also match WAV
    // and AVI, so the check has to reach past it.
    {
        mime: 'image/webp',
        offset: 8,
        bytes: [0x57, 0x45, 0x42, 0x50],
        extension: 'webp'
    }
];

/** Every spelling a client may declare, across all supported formats — including aliases. */
export const ACCEPTED_UPLOAD_MIMETYPES = new Set(
    SUPPORTED_IMAGE_FORMATS.flatMap((format) => [format.mime, ...(format.aliases ?? [])])
);

/** Alias spelling → canonical MIME type, built once from the format table. */
const CANONICAL_MIME_BY_ALIAS = new Map(
    SUPPORTED_IMAGE_FORMATS.flatMap((format) =>
        (format.aliases ?? []).map((alias) => [alias, format.mime] as const)
    )
);

/** Enough bytes for the longest signature plus its offset. */
const HEADER_LENGTH = Math.max(
    ...SUPPORTED_IMAGE_FORMATS.map((format) => format.offset + format.bytes.length)
);

/**
 * The MIME type a buffer's leading bytes actually declare.
 *
 * @param header - The first bytes of a file; a short read simply matches nothing.
 * @returns The identified MIME type, or `undefined` when the bytes match no accepted format.
 */
export const identifyImage = (header: Buffer): string | undefined =>
    SUPPORTED_IMAGE_FORMATS.find(
        (format) =>
            header.length >= format.offset + format.bytes.length &&
            format.bytes.every((byte, index) => header[format.offset + index] === byte)
    )?.mime;

/**
 * The MIME type a file on disk actually is, by its leading bytes.
 *
 * Reads only the header rather than the file: the answer is in the first bytes, and a validator
 * that loads an attacker-sized file into memory to answer a question about twelve of them is its
 * own denial of service.
 *
 * @param filePath - Path to the file to identify.
 * @returns The identified MIME type, or `undefined` for an unrecognised or unreadable file.
 */
export const identifyImageFile = async (filePath: string): Promise<string | undefined> => {
    let handle;
    // eslint-disable-next-line no-restricted-syntax -- an unreadable file is an unidentifiable file, and the finally owns the handle
    try {
        handle = await open(filePath, 'r');
        const header = Buffer.alloc(HEADER_LENGTH);
        const { bytesRead } = await handle.read(header, 0, HEADER_LENGTH, 0);
        return identifyImage(header.subarray(0, bytesRead));
    } catch {
        // Unreadable is not identifiable. The caller rejects either way, so there is nothing to
        // gain by distinguishing "no such file" from "not an image".
        return undefined;
    } finally {
        await handle?.close();
    }
};

/**
 * The file extension an identified image should be stored under.
 *
 * Derived from the type, never the client's filename: `originalname` is attacker-controlled, and
 * once the upload directory is served statically, the extension decides the `Content-Type` a
 * browser gets. Valid PNG bytes stored as `.html` would be served as `text/html` — stored XSS
 * that passes every content check. Can only ever be one of {@link SUPPORTED_IMAGE_FORMATS}'
 * extensions.
 *
 * @param mime - A MIME type returned by {@link identifyImage}.
 * @returns The extension to store it under, or `undefined` for anything unrecognised.
 */
export const extensionForImage = (mime: string | undefined): string | undefined =>
    SUPPORTED_IMAGE_FORMATS.find((format) => format.mime === mime)?.extension;

/**
 * The MIME type a declared `Content-Type` corresponds to, normalised.
 *
 * A declared alias (e.g. the non-IANA `image/jpg`) is folded into its canonical MIME type, per
 * {@link SUPPORTED_IMAGE_FORMATS}, so the declared and sniffed types can be compared as equals.
 *
 * @param declared - The `Content-Type` from the multipart part.
 */
export const normaliseDeclaredImageMime = (declared: string | undefined): string | undefined =>
    declared === undefined ? undefined : (CANONICAL_MIME_BY_ALIAS.get(declared) ?? declared);
