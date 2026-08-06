/**
 * File upload storage (multer).
 *
 * Defines *where* uploads land, *what* they are renamed to, and *which* MIME types are
 * accepted. The resulting `upload` middleware is attached per-route.
 */

import type { Request, RequestHandler } from 'express';
// multer is the `multipart/form-data` body parser for Express. It populates `request.file` /
// `request.files` and, with diskStorage, writes the bytes to disk before the handler runs.
// `FileFilterCallback` is the signature of the accept/reject callback used below.
import multer, { type Field, type FileFilterCallback } from 'multer';
// `randomBytes` = cryptographically secure RNG. Deliberately not `Math.random()`: predictable
// filenames would let someone guess the URL of another user's upload.
import { randomBytes } from 'node:crypto';
import { createLocaleContext, runWithLocaleContext } from '@core/i18n';

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
/**
 * Write file into destination
 * WARNING: Do not upload all files in a single directory. Create subdirectories with a maximum number of files?
 *
 * Routing by `fieldname` (the form field the file arrived in) keeps different upload kinds
 * in different directories — and rejects anything unrecognised rather than defaulting to a
 * shared dump. The target directory must already exist: multer does not create it.
 *
 * Exported, rather than inlined into `diskStorage`, so it can be exercised directly: a storage
 * engine hides its callbacks, and these two encode security decisions (a field whitelist, and
 * never reusing a client-supplied name) that are worth asserting rather than assuming.
 *
 * @param request - the in-flight Express request (available for per-user paths, unused here)
 * @param file - multer's descriptor: fieldname, originalname, mimetype, size
 * @param callback - node-style `(error, destination)`; pass an Error to reject the upload
 */
export const resolveUploadDestination = (
    request: Request,
    file: Express.Multer.File,
    callback: (error: Error | null, destination: string) => void
): void => {
    if (file.fieldname === 'imageUpload')
        // Inside the public/static directory, so uploaded images are servable by URL.
        // eslint-disable-next-line unicorn/no-null
        callback(null, (process.env.NODE_PUBLIC_PATH ?? 'public') + '/images/');
    // if (file.fieldname === "pdfUpload")
    //     callback(null, 'src/uploads/');
    // Unknown field → reject. Whitelist rather than blacklist: an unexpected field name is
    // more likely an attack or a client bug than a legitimate upload.
    else callback(new Error(`Unsupported upload field: ${file.fieldname}`), '');
};

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
export const resolveUploadFilename = (
    request: Request,
    file: Express.Multer.File,
    callback: (error: Error | null, filename: string) => void
): void => {
    // randomize name for security reason.
    // 16 random bytes as hex = 32 chars / 128 bits — collision probability is negligible,
    // and the name is unguessable. Only the extension is carried over from the original,
    // and `fileFilter` has already constrained the type.
    // eslint-disable-next-line unicorn/no-null
    callback(null, randomBytes(16).toString('hex') + '.' + getExtension(file.originalname));
};

export const fileStorage = multer.diskStorage({
    destination: resolveUploadDestination,
    filename: resolveUploadFilename
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
const rawUpload = multer({
    // Where/how files are written (see `fileStorage` above).
    storage: fileStorage,
    // Which files are accepted at all (see `fileFilter` above).
    fileFilter
});

/**
 * Wraps a multer middleware so the request's locale survives it.
 *
 * Multer consumes the request stream, so the rest of the chain resumes from a socket read
 * callback — and that callback's async context is the one the CONNECTION was created in, not the
 * one `attachLocale` established. `AsyncLocalStorage` propagates through async resources created
 * inside a scope; an `EventEmitter` listener is not one, it simply runs in whatever context the
 * emitter is in. So everything after a multipart upload runs outside the store, and the ambient
 * `t` silently falls back to the boot language.
 *
 * It failed exactly one way and it was invisible: `POST /account/signup` with
 * `Accept-Language: it` answered `Content-Language: it` — the header is set by the middleware,
 * which does still run — with English validation messages, because the Zod thunks ran after the
 * context was gone. The JSON path was unaffected (`express.json()` runs *before* `attachLocale`,
 * so nothing awaits the stream afterwards), which is why the integration suite, which posts JSON,
 * saw nothing wrong.
 *
 * Fixed here rather than at the seven route mounts: a route that forgets the wrapper looks
 * perfectly correct and fails only in a language nobody tests in.
 */
const withLocaleRestored =
    (middleware: RequestHandler): RequestHandler =>
    (request, response, next) =>
        middleware(request, response, (error?: unknown) => {
            if (error || !request.locale) return next(error);
            runWithLocaleContext(createLocaleContext(request.locale), () => next());
        });

/**
 * Multer middleware.
 *
 * The configured instance routes mount as `upload.single('imageUpload')`, `upload.array(...)` or
 * `upload.fields(...)` — each already wrapped so the request-scoped locale survives the upload
 * (see {@link withLocaleRestored}).
 *
 * No `limits` are configured, so multer applies its own defaults (unlimited file size, 1 MB
 * per non-file field). Adding `limits: { fileSize }` is the standard hardening step if these
 * routes are ever exposed to untrusted clients.
 */
export const upload = {
    single: (fieldName: string) => withLocaleRestored(rawUpload.single(fieldName)),
    array: (fieldName: string, maxCount?: number) =>
        withLocaleRestored(rawUpload.array(fieldName, maxCount)),
    fields: (fields: Field[]) => withLocaleRestored(rawUpload.fields(fields)),
    none: () => withLocaleRestored(rawUpload.none()),
    any: () => withLocaleRestored(rawUpload.any())
};
