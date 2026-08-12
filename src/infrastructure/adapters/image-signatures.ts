import { open } from 'node:fs/promises';

/**
 * Content-based image identification.
 *
 * `Content-Type` on an upload is whatever the client wrote there — `curl -F 'x=@shell.html;type=image/png'`
 * sets it to anything. So the type is decided by the leading bytes instead, which a format's
 * specification fixes and cannot be varied.
 *
 * It matters because of what reads the file later: a static server labelling by extension, an SVG
 * carrying `<script>`, or an image decoder handed attacker-controlled input.
 *
 * Deliberately not a dependency (`file-type` et al): three signatures, and a whitelist this short
 * is easier to audit inline than to trust.
 */

/**
 * One accepted format: the exact bytes it must begin with, and the MIME type it really is.
 *
 * `offset` exists because some formats do not start at byte 0 — WebP's marker sits at 8, after
 * the RIFF header — so it is modelled from the start rather than bolted on later.
 */
interface IImageSignature {
    mime: string;
    offset: number;
    bytes: readonly number[];
}

/**
 * Raster formats only. No SVG: it is XML that browsers execute, so accepting it means accepting
 * script upload, and no amount of sniffing makes that safe.
 */
const IMAGE_SIGNATURES: readonly IImageSignature[] = [
    // \x89PNG\r\n\x1a\n — the trailing bytes exist to catch transfers that mangled line endings,
    // which is exactly why matching all eight is worth more than matching the first four.
    {
        mime: 'image/png',
        offset: 0,
        bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    },
    // SOI marker plus the first byte of the next marker. JPEG has no longer fixed prefix: what
    // follows varies by encoder (JFIF, Exif, raw), so three bytes is the honest maximum.
    {
        mime: 'image/jpeg',
        offset: 0,
        bytes: [0xff, 0xd8, 0xff]
    },
    // 'WEBP', at offset 8, inside a RIFF container. The RIFF magic alone would also match WAV
    // and AVI, so the check has to reach past it.
    {
        mime: 'image/webp',
        offset: 8,
        bytes: [0x57, 0x45, 0x42, 0x50]
    }
];

/** Enough bytes for the longest signature plus its offset. */
const HEADER_LENGTH = Math.max(
    ...IMAGE_SIGNATURES.map((signature) => signature.offset + signature.bytes.length)
);

/**
 * The MIME type a buffer's leading bytes actually declare.
 *
 * @param header - The first bytes of a file; a short read simply matches nothing.
 * @returns The identified MIME type, or `undefined` when the bytes match no accepted format.
 */
export const identifyImage = (header: Buffer): string | undefined =>
    IMAGE_SIGNATURES.find(
        (signature) =>
            header.length >= signature.offset + signature.bytes.length &&
            signature.bytes.every((byte, index) => header[signature.offset + index] === byte)
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
 * Derived from the type, never from the client's filename. `originalname` is attacker-controlled
 * in full — and once the upload directory is served statically, the extension is what decides the
 * `Content-Type` a browser receives. A file stored as `.html` is served as `text/html`, and a PNG
 * may legally carry arbitrary bytes in its metadata chunks, so "valid PNG bytes under an .html
 * name" is stored XSS that passes every content check.
 *
 * A closed map is the fix: the value can only ever be one of these four strings.
 *
 * @param mime - A MIME type returned by {@link identifyImage}.
 * @returns The extension to store it under, or `undefined` for anything unrecognised.
 */
export const extensionForImage = (mime: string | undefined): string | undefined =>
    ({
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp'
    })[mime ?? ''];

/**
 * The MIME type a declared `Content-Type` corresponds to, normalised.
 *
 * `image/jpg` is not a real IANA type but is sent often enough that rejecting it would reject
 * valid JPEGs over a spelling mistake; it is folded into `image/jpeg` here so the declared and
 * sniffed types can be compared as equals.
 *
 * @param declared - The `Content-Type` from the multipart part.
 */
export const normaliseDeclaredImageMime = (declared: string | undefined): string | undefined =>
    declared === 'image/jpg' ? 'image/jpeg' : declared;
