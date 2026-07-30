/**
 * File upload storage (multer).
 *
 * Defines *where* uploads land, *what* they are renamed to, and *which* MIME types are
 * accepted. The resulting `upload` middleware is attached per-route.
 */

import type { Request } from 'express';
// multer is the `multipart/form-data` body parser for Express. It populates `request.file` /
// `request.files` and, with diskStorage, writes the bytes to disk before the handler runs.
// `FileFilterCallback` is the signature of the accept/reject callback used below.
import multer, { type FileFilterCallback } from 'multer';
// `randomBytes` = cryptographically secure RNG. Deliberately not `Math.random()`: predictable
// filenames would let someone guess the URL of another user's upload.
import { randomBytes } from 'node:crypto';

/**
 * Get extension of filename
 *
 * Returns the substring after the last dot, *without* the dot. Note the edge case: a filename
 * with no dot returns the whole name (`lastIndexOf` gives -1, so the slice starts at 0).
 * Acceptable here because the value is only appended to a random name, and `fileFilter`
 * already restricts uploads to real images.
 *
 * @param filename - original client-supplied name
 */
export function getExtension(filename: string) {
    return filename.slice(filename.lastIndexOf('.') + 1);
}

/**
 * Manage file storage
 *
 * `multer.diskStorage` builds a storage engine from two callbacks — `destination` (which
 * directory) and `filename` (what to call it). The alternative, `multer.memoryStorage()`, keeps
 * uploads in a Buffer, which is faster but lets a large upload exhaust process memory.
 */
export const fileStorage = multer.diskStorage({
    /**
     * Write file into destination
     * WARNING: Do not upload all files in a single directory. Create subdirectories with a maximum number of files?
     *
     * Routing by `fieldname` (the form field the file arrived in) keeps different upload kinds
     * in different directories — and rejects anything unrecognised rather than defaulting to a
     * shared dump. The target directory must already exist: multer does not create it.
     *
     * @param request - the in-flight Express request (available for per-user paths, unused here)
     * @param file - multer's descriptor: fieldname, originalname, mimetype, size
     * @param callback - node-style `(error, destination)`; pass an Error to reject the upload
     */
    destination: (
        request: Request,
        file: Express.Multer.File,
        callback: (error: Error | null, destination: string) => void
    ) => {
        if (file.fieldname === 'imageUpload')
            // Inside the public/static directory, so uploaded images are servable by URL.
            // eslint-disable-next-line unicorn/no-null
            callback(null, (process.env.NODE_PUBLIC_PATH ?? 'public') + '/images/');
        // if (file.fieldname === "pdfUpload")
        //     callback(null, 'src/uploads/');
        // Unknown field → reject. Whitelist rather than blacklist: an unexpected field name is
        // more likely an attack or a client bug than a legitimate upload.
        else callback(new Error(`Unsupported upload field: ${file.fieldname}`), '');
    },

    /**
     * Change file name
     *
     * The client-supplied `originalname` is never reused as-is. That would allow path traversal
     * (`../../etc/passwd`), overwriting an existing file by name collision, and enumeration of
     * other users' uploads.
     *
     * @param request
     * @param file
     * @param callback - node-style `(error, filename)`
     */
    filename: (
        request: Request,
        file: Express.Multer.File,
        callback: (error: Error | null, filename: string) => void
    ) => {
        // randomize name for security reason.
        // 16 random bytes as hex = 32 chars / 128 bits — collision probability is negligible,
        // and the name is unguessable. Only the extension is carried over from the original,
        // and `fileFilter` has already constrained the type.
        // eslint-disable-next-line unicorn/no-null
        callback(null, randomBytes(16).toString('hex') + '.' + getExtension(file.originalname));
    }
});

/**
 * Whitelist for file type
 *
 * Called by multer *before* the file is written, so rejected uploads never touch disk.
 *
 * Two things to be aware of: `mimetype` is taken from the client's Content-Type header and can
 * be forged (real validation means inspecting magic bytes), and rejecting with
 * `callback(null, false)` silently *drops* the file — the request still succeeds with no
 * `request.file`, so the handler must treat a missing file as a validation failure.
 * Passing an Error instead would surface it as a request error.
 *
 * @param request
 * @param file
 * @param callback - `(error, acceptFile)`
 */
export const fileFilter = (
    request: Request,
    file: Express.Multer.File,
    callback: FileFilterCallback
): void =>
    // Images only. Note 'image/jpg' is not a real IANA type, but some clients send it anyway.
    file.mimetype === 'image/png' || file.mimetype === 'image/jpg' || file.mimetype === 'image/jpeg'
        ? // eslint-disable-next-line unicorn/no-null
          callback(null, true)
        : // eslint-disable-next-line unicorn/no-null
          callback(null, false);

/**
 * Multer middleware
 *
 * The configured instance routes mount as `upload.single('imageUpload')`,
 * `upload.array(...)` or `upload.fields(...)`.
 *
 * No `limits` are configured, so multer applies its own defaults (unlimited file size, 1 MB
 * per non-file field). Adding `limits: { fileSize }` is the standard hardening step if these
 * routes are ever exposed to untrusted clients.
 */
export const upload = multer({
    // Where/how files are written (see `fileStorage` above).
    storage: fileStorage,
    // Which files are accepted at all (see `fileFilter` above).
    fileFilter
});
