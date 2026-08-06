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
import { createLocaleContext, runWithLocaleContext, t } from '@core/i18n';
import { identifyImageFile } from '@core/adapters/image-signatures';
import { deleteFile } from '@core/adapters/filesystem';
import { getFormFiles } from '@core/http/uploads';
import { logger } from '@core/adapters/logger';
import { ExtendedError } from '@core/http/errors';

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
 * Declared types this API is willing to consider.
 *
 * `image/jpg` is not a real IANA type, but enough clients send it that rejecting it would be
 * rejecting valid JPEGs over a spelling mistake. The bytes decide the truth either way — see
 * {@link validateUploadedImages}.
 */
const ACCEPTED_UPLOAD_MIMETYPES = new Set(['image/png', 'image/jpg', 'image/jpeg', 'image/webp']);

/**
 * First gate: the type the client CLAIMS.
 *
 * Called by multer before the file is written, so an obviously-wrong upload never touches disk —
 * which is its whole value. It is not, and cannot be, a real type check: `mimetype` comes from
 * the client's own `Content-Type` on the part, and nothing verifies it. The bytes are checked
 * after the write, by {@link validateUploadedImages}.
 *
 * Rejecting with `callback(null, false)` silently *drops* the file — the request still succeeds
 * with no `request.file`, so the handler must treat a missing file as a validation failure.
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
    ACCEPTED_UPLOAD_MIMETYPES.has(file.mimetype)
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
/**
 * Ceiling on a single upload, in bytes. 5 MB by default, overridable per deployment.
 *
 * Multer's own default is UNLIMITED, which on a public endpoint is a denial of service with no
 * exploit required: a client streams until the disk fills, and every byte is written before any
 * handler runs. A limit is the only thing that stops it, and it has to be here rather than in a
 * handler for the same reason.
 */
const DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const getMaxUploadBytes = () => {
    const configured = Number.parseInt(process.env.NODE_MAX_UPLOAD_BYTES ?? '', 10);
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_UPLOAD_BYTES;
};

const rawUpload = multer({
    // Where/how files are written (see `fileStorage` above).
    storage: fileStorage,
    // Which files are accepted at all (see `fileFilter` above).
    fileFilter,
    limits: {
        fileSize: getMaxUploadBytes(),
        // These endpoints accept one image. Without a cap, a request carrying ten thousand file
        // parts is accepted and each one is written.
        files: 1,
        // Non-file parts are bounded too: multer's 1 MB per field is generous, and the number of
        // fields is unlimited by default, so a body of a million empty fields is otherwise a
        // free way to burn parser time.
        fields: 32,
        fieldSize: 100 * 1024,
        parts: 64
    }
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
 * Second gate: the type the FILE ACTUALLY IS.
 *
 * Runs after multer, because the bytes do not exist until then — a `fileFilter` sees headers, not
 * content, so a content check cannot live there. Anything whose leading bytes are not one of the
 * accepted image formats is deleted and the request fails; the window in which a rejected file
 * exists on disk is the few milliseconds between the write and this read, under a random name in
 * a directory this app does not serve.
 *
 * Rejecting with a 422 rather than dropping the file silently, unlike `fileFilter`: a client that
 * uploaded a real file and got a success with no image would have no idea why, and a client
 * uploading something disguised should be told plainly that it was rejected.
 *
 * @param request - Express request already processed by a multer middleware.
 * @param _response - Unused; the error handler formats the rejection.
 * @param next - Called with an `ExtendedError` when any uploaded file fails the check.
 */
export const validateUploadedImages: RequestHandler = (request, _response, next) => {
    const paths = getFormFiles(request);
    if (!paths || paths.length === 0) return next();

    void Promise.all(paths.map((path) => identifyImageFile(path)))
        .then((identified) => {
            const rejected = paths.filter((_path, index) => identified[index] === undefined);
            if (rejected.length === 0) return next();

            // Logged, because a mismatch between the declared type and the bytes is not a typo —
            // it is either a broken client or someone probing what this endpoint will store.
            logger.warn({
                message: 'Upload rejected: content does not match an accepted image format.',
                files: rejected,
                declared: request.file?.mimetype,
                request_id: request.requestId
            });

            return Promise.all(rejected.map((path) => deleteFile(path))).then(() =>
                next(
                    // `true` = operational: a client sent something invalid, which is expected
                    // traffic, not a programmer error worth logging as one.
                    new ExtendedError('Unprocessable Entity', 422, true, [
                        t('generic.error-invalid-data')
                    ])
                )
            );
        })
        .catch((error: Error) => next(error));
};

/**
 * Multer middleware.
 *
 * The configured instance routes mount as `upload.single('imageUpload')`, `upload.array(...)` or
 * `upload.fields(...)`. Each is wrapped twice: once so the request-scoped locale survives the
 * upload (see {@link withLocaleRestored}), and once so the stored bytes are checked against the
 * format they claim to be (see {@link validateUploadedImages}). Composing both here rather than
 * at the route mounts is deliberate — a route that forgets one of them looks perfectly correct.
 */
const wrapUpload = (middleware: RequestHandler): RequestHandler[] => [
    withLocaleRestored(middleware),
    validateUploadedImages
];

export const upload = {
    single: (fieldName: string) => wrapUpload(rawUpload.single(fieldName)),
    array: (fieldName: string, maxCount?: number) =>
        wrapUpload(rawUpload.array(fieldName, maxCount)),
    fields: (fields: Field[]) => wrapUpload(rawUpload.fields(fields)),
    none: () => wrapUpload(rawUpload.none()),
    any: () => wrapUpload(rawUpload.any())
};
