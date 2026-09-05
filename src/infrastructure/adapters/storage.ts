/**
 * @module
 * File upload storage (multer): defines *where* uploads land, *what* they are renamed to, and
 * *which* MIME types are accepted. The resulting `upload` middleware is attached per-route.
 */

import type { Request, RequestHandler } from 'express';
// multer is the `multipart/form-data` body parser for Express. It populates `request.file` /
// `request.files` and, with diskStorage, writes the bytes to disk before the handler runs.
// `FileFilterCallback` is the signature of the accept/reject callback used below.
import multer, { type FileFilterCallback, type Multer } from 'multer';
// `randomBytes` = cryptographically secure RNG. Deliberately not `Math.random()`: predictable
// filenames would let someone guess the URL of another user's upload.
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createLocaleContext, runWithLocaleContext, t } from '@infrastructure/i18n';
import {
    ACCEPTED_UPLOAD_MIMETYPES,
    extensionForImage,
    identifyImageFile,
    normaliseDeclaredImageMime
} from '@infrastructure/adapters/image-signatures';
import { deleteFile } from '@infrastructure/adapters/filesystem';
import { imageStore } from '@infrastructure/adapters/image-store';
import { digestQuarantinedImage } from '@infrastructure/adapters/image.worker';
import { isQueueEnabled } from '@infrastructure/adapters/queue';
import { getFormFiles } from '@infrastructure/http/uploads';
import { logger } from '@infrastructure/adapters/logger';
import { ExtendedError } from '@infrastructure/http/errors';
import { environmentNumber } from '@infrastructure/runtime/environment';

/**
 * Where an upload is written while the request is still being decided — NOT the public directory.
 *
 * A file in `public/` is fetchable by the world, and between "multer wrote it" and "accepted" sit
 * every content check, validation and database write — nothing is reachable until
 * {@link quarantineUploadedImages} commits it. Staging is also what makes "written" and "stored"
 * two separate moments, which is what lets the second one be a remote bucket. Override with
 * `NODE_UPLOAD_STAGING_PATH` when temp is small, a tmpfs below the cap, or unwritable by the app user.
 *
 * See: docs/tools/security.md
 */
export const uploadStagingPath = () =>
    process.env.NODE_UPLOAD_STAGING_PATH ?? path.join(tmpdir(), 'node-api-uploads');

/**
 * Write an uploaded file into the staging directory.
 *
 * Routes by `fieldname`, rejecting anything unrecognised rather than defaulting to a shared dump.
 * Exported (not inlined into `diskStorage`) so this security decision — a field whitelist — is
 * something a test can exercise directly rather than assume.
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
    // Unknown field → reject. Whitelist rather than blacklist: an unexpected field name is
    // more likely an attack or a client bug than a legitimate upload.
    if (file.fieldname !== 'imageUpload') {
        callback(new Error(`Unsupported upload field: ${file.fieldname}`), '');
        return;
    }

    // Created on demand because multer will not create it, and the default lives in the system
    // temp directory, which a reboot empties.
    const staging = uploadStagingPath();
    void mkdir(staging, { recursive: true })
        .then(() => callback(null, staging))
        .catch((error: Error) => callback(error, ''));
};

/**
 * Choose the stored filename — never the client-supplied `originalname`, in whole or in part.
 *
 * Reusing the stem would allow path traversal (`../../etc/passwd`), name-collision overwrites,
 * and enumeration of other users' uploads. Reusing its EXTENSION is just as dangerous once the
 * directory is served statically: the extension decides the `Content-Type` sent, and valid image
 * bytes stored as `.html` would be served as `text/html` — stored XSS past a content check. The
 * extension comes from the declared type instead, already constrained by `fileFilter` and
 * confirmed against the bytes by `validateUploadedImages`.
 *
 * @param request - the in-flight Express request (available for per-user paths, unused here)
 * @param file - multer's descriptor: fieldname, originalname, mimetype, size
 * @param callback - node-style `(error, filename)`
 */
export const resolveUploadFilename = (
    request: Request,
    file: Express.Multer.File,
    callback: (error: Error | null, filename: string) => void
): void => {
    // 16 random bytes as hex = 32 chars / 128 bits — collision probability is negligible, and
    // the name is unguessable, which is what keeps one user's uploads from being enumerable.
    const extension = extensionForImage(normaliseDeclaredImageMime(file.mimetype)) ?? 'bin';
    callback(null, randomBytes(16).toString('hex') + '.' + extension);
};

/**
 * Manage file storage
 *
 * `multer.diskStorage` builds a storage engine from two callbacks — `destination` (which
 * directory) and `filename` (what to call it). The alternative, `multer.memoryStorage()`, keeps
 * uploads in a Buffer, which is faster but lets a large upload exhaust process memory.
 */
export const fileStorage = multer.diskStorage({
    destination: resolveUploadDestination,
    filename: resolveUploadFilename
});

/**
 * First gate: the type the client CLAIMS.
 *
 * Runs before the file is written, so an obviously-wrong upload never touches disk. Not a real
 * type check — `mimetype` is client-supplied and unverified; the bytes are checked after the
 * write by {@link validateUploadedImages}. Rejecting with `callback(null, false)` silently drops
 * the file (the request still succeeds with no `request.file`), rather than surfacing an Error.
 *
 * @param request - the in-flight Express request (unused here)
 * @param file - multer's descriptor: fieldname, originalname, mimetype, size
 * @param callback - `(error, acceptFile)`
 */
export const fileFilter = (
    request: Request,
    file: Express.Multer.File,
    callback: FileFilterCallback
): void =>
    // Images only. Note 'image/jpg' is not a real IANA type, but some clients send it anyway.
    ACCEPTED_UPLOAD_MIMETYPES.has(file.mimetype) ? callback(null, true) : callback(null, false);

/**
 * Ceiling on a single upload, in bytes. 5 MB by default, overridable per deployment.
 *
 * Multer's own default is UNLIMITED — on a public endpoint that's a DoS with no exploit needed,
 * since every byte is written to disk before any handler runs. Has to live here, not in a
 * handler, for the same reason.
 */
const DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * The ceiling a mount applies right now. Read at call time, so a deployment that sets
 * `NODE_MAX_UPLOAD_BYTES` after this module is evaluated still gets its value — and so a test can
 * ask for the number rather than restating the default and hoping they agree.
 */
export const maxUploadBytes = (): number =>
    environmentNumber('NODE_MAX_UPLOAD_BYTES', DEFAULT_MAX_UPLOAD_BYTES, 1);

/**
 * The configured multer instance, built on first use.
 *
 * Memoised because `limits` are FROZEN at construction — a value read while this module is being
 * evaluated is fixed before `.env` has necessarily loaded, same lazy-env reason every other
 * adapter uses. One instance for the whole process: multer keeps no per-request state, so
 * rebuilding it per call would just rebuild the storage engine too.
 */
let configuredUpload: Multer | undefined;

/** Build (once) and return the shared multer instance — see {@link configuredUpload}. */
const rawUpload = (): Multer =>
    (configuredUpload ??= multer({
        // Where/how files are written (see `fileStorage` above).
        storage: fileStorage,
        // Which files are accepted at all (see `fileFilter` above).
        fileFilter,
        limits: {
            fileSize: maxUploadBytes(),
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
    }));

/**
 * Wraps a multer middleware so the request's locale survives it.
 *
 * Multer consumes the request stream, so the rest of the chain resumes from a socket read
 * callback whose async context is the CONNECTION's, not the one `attachLocale` established —
 * `AsyncLocalStorage` propagates through async resources created inside a scope, and an
 * `EventEmitter` listener isn't one. Left unfixed, everything after a multipart upload runs
 * outside the store and the ambient `t` silently falls back to the boot language.
 *
 * Fixed here rather than at each route mount: a route that forgets the wrapper looks perfectly
 * correct and fails only in a language nobody tests in.
 */
const withLocaleRestored =
    (middleware: RequestHandler): RequestHandler =>
    (request, response, next) =>
        middleware(request, response, (error?: unknown) => {
            if (error || !request.locale) {
                next(error);
                return;
            }
            runWithLocaleContext(createLocaleContext(request.locale), () => next());
        });

/**
 * Second gate: the type the FILE ACTUALLY IS.
 *
 * Runs after multer, since the bytes don't exist until then — `fileFilter` sees only headers.
 * Anything whose leading bytes don't match an accepted format is deleted and the request fails;
 * the rejected file exists on disk only the few milliseconds between the write and this read,
 * under a random name in a directory this app doesn't serve. Rejects with a 422 rather than
 * silently dropping the file, unlike `fileFilter` — the client should be told plainly.
 *
 * @param request - Express request already processed by a multer middleware.
 * @param _response - Unused; the error handler formats the rejection.
 * @param next - Called with an `ExtendedError` when any uploaded file fails the check.
 */
export const validateUploadedImages: RequestHandler = (request, _response, next) => {
    const paths = getFormFiles(request);
    if (!paths || paths.length === 0) {
        next();
        return;
    }

    // The declared type decided the stored EXTENSION, and the extension decides the
    // `Content-Type` a static file server sends — so the bytes have to match the declaration,
    // not merely be some image. Valid JPEG bytes stored as `.png` would otherwise be served as
    // `image/png`; harmless today, but it is the same class of mismatch this whole check exists
    // to remove, and cheap to close while the file is in hand.
    const declared = normaliseDeclaredImageMime(request.file?.mimetype);

    void Promise.all(paths.map((path) => identifyImageFile(path)))
        .then((identified) => {
            const rejected = paths.filter(
                (_path, index) =>
                    identified[index] === undefined ||
                    (declared !== undefined && identified[index] !== declared)
            );
            if (rejected.length === 0) {
                next();
                return;
            }

            // Logged, because a mismatch between the declared type and the bytes is not a typo —
            // it is either a broken client or someone probing what this endpoint will store.
            logger.warn({
                message: 'Upload rejected: content does not match the declared image format.',
                files: rejected,
                declared,
                identified,
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
 * Third and last step: quarantine the staged file and — with no broker to hand the digest job
 * to — run the whole digest pipeline right here.
 *
 * Runs only once the bytes are proven to be the image they claim. Results go on the request, in
 * one of two shapes depending on whether a broker is configured: `request.quarantinedImageKeys`
 * (pending placeholder, digested later) or `request.storedImageUrls`/`storedThumbnailUrls`
 * (already promoted, real urls).
 *
 * A failure here fails the request: a quarantined image the database write then contradicts is
 * recoverable, while a row pointing at bytes never stored is a 404 forever.
 */
export const quarantineUploadedImages: RequestHandler = (request, _response, next) => {
    const staged = getFormFiles(request);
    if (!staged || staged.length === 0) {
        next();
        return;
    }

    // `allSettled`, not `all`: with several files the interesting failure is the partial one, and
    // `all` rejects while the successful quarantines are still in flight — leaving files quarantined
    // that nothing will ever reference or reap early. The results are needed to clean those up.
    void Promise.allSettled(staged.map((stagedPath) => imageStore.quarantine(stagedPath))).then(
        (results) => {
            const failed = results.find((result) => result.status === 'rejected');
            if (failed) {
                return Promise.all([
                    // Staged files are nobody's responsibility now. A successful `quarantine`
                    // already consumed its own, and deleting a file that is gone is a no-op.
                    ...staged.map((stagedPath) => deleteFile(stagedPath)),
                    // Anything that DID make it into quarantine is now unreferenced — the request
                    // is about to fail, so no row will ever name it.
                    ...results
                        .filter((result) => result.status === 'fulfilled')
                        .map((result) => imageStore.removeQuarantined(result.value))
                ]).then(() => next(failed.reason));
            }

            const keys = results.map((result) => (result as PromiseFulfilledResult<string>).value);

            if (isQueueEnabled()) {
                request.quarantinedImageKeys = keys;
                next();
                return;
            }

            // No broker: the contract promises a real `thumbnailUrl` regardless, so the digest
            // runs now, inline, before the request is allowed to proceed — same shape as
            // `enqueueEmail` sending inline rather than dropping the message.
            return Promise.all(keys.map((key) => digestQuarantinedImage(key)))
                .then((digested) => {
                    request.storedImageUrls = digested.map((result) => result.imageUrl);
                    request.storedThumbnailUrls = digested.map((result) => result.thumbnailUrl);
                    next();
                })
                .catch((error: Error) =>
                    Promise.all(keys.map((key) => imageStore.removeQuarantined(key))).then(() =>
                        next(error)
                    )
                );
        }
    );
};

/**
 * Compose the full upload pipeline: locale restored across the body parse (see
 * {@link withLocaleRestored}), bytes checked against their claimed format (see
 * {@link validateUploadedImages}), and only then quarantined — with no broker, digested too (see
 * {@link quarantineUploadedImages}). Done here, not at each route mount, because the one thing a
 * route could forget is a security check.
 */
const wrapUpload = (middleware: RequestHandler): RequestHandler[] => [
    withLocaleRestored(middleware),
    validateUploadedImages,
    quarantineUploadedImages
];

/**
 * The public surface this module exposes to routes.
 *
 * `upload.single(fieldName)` returns the full middleware chain for one route: multer's own
 * upload (locale-restored), the content check, and quarantine/digest — see {@link wrapUpload}.
 */
export const upload = {
    single: (fieldName: string) => wrapUpload(rawUpload().single(fieldName))
};
