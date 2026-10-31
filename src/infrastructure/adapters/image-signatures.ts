/**
 * @module
 * Content-based image identification. `Content-Type` on an upload is whatever the client wrote —
 * trivially spoofable — so the type is decided by the leading bytes instead, which a format's
 * spec fixes. It matters because of what reads the file later: a static server labelling by
 * extension, an SVG carrying `<script>`, or a decoder handed attacker-controlled input.
 * Deliberately not a dependency (`file-type` et al): three signatures is easier to audit in a
 * table than to trust.
 */

import { open } from 'node:fs/promises';
import { ACCEPTED_UPLOAD_TYPES, type AcceptedUploadType } from '@api/upload-types';
import { imageRuleData } from './images.generated';

/**
 * One accepted image format: its real MIME type, any alias spelling a client may declare, the
 * exact bytes it must begin with, and the extension it's stored under. It says how to RECOGNISE a
 * format; which formats the API accepts is the contract's list (`@api/upload-types`).
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
    /** Further markers that must also match (WebP: `RIFF` at 0 as well as `WEBP` at 8). */
    alsoRequires?: readonly { offset: number; bytes: readonly number[] }[];
}

/**
 * Raster formats only. No SVG: it is XML that browsers execute, so accepting it means accepting
 * script upload, and no amount of sniffing makes that safe. The table is data:
 * `shared/rules/images.yaml`, with each signature's reasoning beside it.
 */
const SUPPORTED_IMAGE_FORMATS: readonly ImageFormat[] = imageRuleData.formats;

/** The MIME types the signature table can recognise. */
type SignedType = (typeof imageRuleData.formats)[number]['mime'];

/** Resolves to `true` only when two unions name exactly the same members. */
type SameMembers<TA, TB> = [TA] extends [TB] ? ([TB] extends [TA] ? true : false) : false;

/**
 * Compile-time proof that the signature table and the contract list the same types. A contract
 * type with no signature, or a signature for a type the contract does not accept, makes this
 * annotation fail `tsc`, so the two cannot drift apart in either direction.
 */
export const SIGNATURES_COVER_CONTRACT: SameMembers<AcceptedUploadType, SignedType> = true;

/**
 * Every spelling a client may declare: the contract's accepted types, plus the aliases the
 * signature table tolerates (the non-IANA `image/jpg` is not API surface, so not in the contract).
 */
export const ACCEPTED_UPLOAD_MIMETYPES: ReadonlySet<string> = new Set([
    ...ACCEPTED_UPLOAD_TYPES,
    ...SUPPORTED_IMAGE_FORMATS.flatMap((format) => format.aliases ?? [])
]);

/** Alias spelling → canonical MIME type, built once from the format table. */
const CANONICAL_MIME_BY_ALIAS = new Map(
    SUPPORTED_IMAGE_FORMATS.flatMap((format) =>
        (format.aliases ?? []).map((alias) => [alias, format.mime] as const)
    )
);

/** Enough bytes for the longest signature plus its offset. */
const HEADER_LENGTH = Math.max(
    ...SUPPORTED_IMAGE_FORMATS.flatMap((format) =>
        [format, ...(format.alsoRequires ?? [])].map(
            (marker) => marker.offset + marker.bytes.length
        )
    )
);

/**
 * Whether a header carries a marker's bytes at the marker's offset.
 *
 * @param header - The first bytes of a file.
 * @param marker - The offset and bytes to look for.
 */
const hasMarker = (header: Buffer, marker: { offset: number; bytes: readonly number[] }): boolean =>
    header.length >= marker.offset + marker.bytes.length &&
    marker.bytes.every((byte, index) => header[marker.offset + index] === byte);

/**
 * The MIME type a buffer's leading bytes actually declare.
 *
 * @param header - The first bytes of a file; a short read simply matches nothing.
 * @returns The identified MIME type, or `undefined` when the bytes match no accepted format.
 */
export const identifyImage = (header: Buffer): string | undefined =>
    SUPPORTED_IMAGE_FORMATS.find(
        (format) =>
            hasMarker(header, format) &&
            (format.alsoRequires ?? []).every((marker) => hasMarker(header, marker))
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
