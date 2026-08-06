import { open } from 'node:fs/promises';

/**
 * Content-based image identification.
 *
 * `Content-Type` on an uploaded part is whatever the client wrote there. It is not derived from
 * the bytes, nothing verifies it, and `curl -F 'imageUpload=@shell.html;type=image/png'` sets it
 * to anything you like — so a MIME check is a check on a claim, not on a file.
 *
 * What that buys an attacker depends on what later reads the file, and the answer is rarely
 * "nothing":
 *
 * - Anything serving the upload directory statically will serve the bytes. `helmet()` sets
 *   `X-Content-Type-Options: nosniff`, which stops a browser from *re-interpreting* a response,
 *   but that only helps if the server labels the response correctly in the first place — a
 *   reverse proxy labelling by file extension would happily send `Content-Type: image/png` for a
 *   file whose bytes are HTML, and `nosniff` then guarantees the browser treats it as an image
 *   rather than protecting anyone. The real fix is not storing it.
 * - An SVG is a document, not a raster image: it can carry `<script>`. It is already outside the
 *   accepted list here, and content sniffing is what keeps it outside when the extension lies.
 * - Anything that later hands the file to an image processor gets attacker-controlled input to a
 *   decoder, which is where image-library CVEs live.
 *
 * So the type is decided by the leading bytes — the part of a file format that is fixed by the
 * specification and cannot be varied without producing a file that is no longer that format.
 *
 * Deliberately not a dependency (`file-type` et al): three signatures, no ambiguity, and a
 * whitelist this short is easier to audit inline than to trust.
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
