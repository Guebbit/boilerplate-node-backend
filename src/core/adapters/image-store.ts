/**
 * Image storage — the port every caller outside this module talks to.
 *
 * The rule that makes this worth having: **nothing outside this file may turn an `imageUrl` into a
 * filesystem path.** That is precisely what the code it replaces did — `deleteFile(NODE_PUBLIC_PATH
 * + product.imageUrl)`, spelled out in the products service and again in three write controllers —
 * and it is why "move uploads to a bucket" was a change to five files instead of one. Here, the
 * value persisted in `imageUrl` is an opaque handle: this module is the only thing that knows
 * whether it names a file under `public/`, an object in a bucket, or something it does not own at
 * all.
 *
 * Two backends exist in principle and one in practice:
 *
 *   - **local** (the default, and what every deployment runs today): the file lands under
 *     `NODE_PUBLIC_PATH/images/` and the stored value is the server-relative `/images/<name>` that
 *     `express.static` answers.
 *   - **remote**: selected when `NODE_IMAGE_STORE_BUCKET` is set, and NOT IMPLEMENTED — see the
 *     TODO on {@link remoteImageStore}. It is wired up to the point of being switched on, and
 *     refuses to run rather than silently falling back, because a half-configured deployment that
 *     quietly kept writing to local disk would scatter images across two places and only tell you
 *     when the container was rebuilt.
 */

import path from 'node:path';
import { deleteFile, moveFile } from '@core/adapters/filesystem';
import { toPosixPath } from '@core/http/uploads';

export interface IImageStore {
    /**
     * Take a staged upload into storage, and return the value to persist in `imageUrl`.
     *
     * The staged file is consumed: on success it is no longer at `stagedPath`. Its basename is the
     * object key — multer already named it 32 random hex characters plus the extension its declared
     * type earns (`resolveUploadFilename`), so the name is unguessable and collision-free, and no
     * part of it comes from the client.
     *
     * THROWS on failure, unlike {@link remove}: the bytes not being where the database is about to
     * say they are is exactly the case a request must fail on.
     *
     * @param stagedPath - the private path multer wrote the upload to
     * @returns the stored image's url — server-relative for the local store, absolute for a remote
     *   one, both legal under `ImageUrl` (`format: uri-reference`) in `openapi.yaml`
     */
    put(stagedPath: string): Promise<string>;

    /**
     * Delete the stored image an `imageUrl` names.
     *
     * Never rejects, and never throws: cleanup runs on failure paths that are already answering an
     * error to the client, and a failed unlink must not become a second, different failure.
     *
     * @param imageUrl - the value as persisted on the document. Anything this store does not own —
     *   an absolute url, a path outside its root, nothing at all — is a no-op.
     * @returns whether something was actually deleted
     */
    remove(imageUrl: string | undefined): Promise<boolean>;
}

/**
 * The directory (local) / key prefix (remote) uploads live under, and the URL segment they are
 * served from. One constant because the three have to agree: `express.static` serves
 * `NODE_PUBLIC_PATH` at the site root, so the folder name *is* the url segment.
 */
const IMAGES_SEGMENT = 'images';

const publicRoot = () => path.resolve(process.env.NODE_PUBLIC_PATH ?? 'public');

/**
 * Whether a value looks like a URL pointing somewhere else entirely.
 *
 * Two forms qualify: an absolute URL with a scheme (`https://cdn.example.com/x.png`, which is what
 * `NODE_DEFAULT_IMAGE_USER` / `NODE_DEFAULT_IMAGE_PRODUCT` hold, and what a remote store will start
 * writing) and a protocol-relative one (`//cdn.example.com/x.png`). Deleting a product whose image
 * is the configured default must not attempt to unlink `public/https://…`, which is what the
 * concatenation this replaces did — harmlessly, because the stat fails, but only by accident.
 *
 * `URL.canParse` is not used: it accepts `mailto:` and every other scheme, and rejects the
 * protocol-relative form, so it answers a different question than the one being asked.
 */
const isRemoteUrl = (value: string) =>
    /^[a-z][\d+.a-z-]*:\/\//i.test(value) || value.startsWith('//');

/**
 * The store this API has always had: files under `NODE_PUBLIC_PATH/images/`, served by
 * `express.static`, addressed by the server-relative path `/images/<name>`.
 */
export const filesystemImageStore: IImageStore = {
    put: async (stagedPath) => {
        const key = path.basename(stagedPath);
        await moveFile(stagedPath, path.join(publicRoot(), IMAGES_SEGMENT, key));
        // Built from literals rather than `path.join`, because this is a URL: on Windows `join`
        // would answer `\images\x.png`, which `express.static` does not serve and which is broken
        // the moment it reaches a browser.
        return `/${IMAGES_SEGMENT}/${key}`;
    },

    remove: (imageUrl) => {
        if (!imageUrl || isRemoteUrl(imageUrl)) return Promise.resolve(false);

        const root = publicRoot();
        // `imageUrl` is rooted at the static mount ('/images/x.png'), so it is joined to the public
        // directory rather than resolved as an absolute path — `path.resolve(root, '/images/x')`
        // would answer '/images/x', the machine's root, since a leading slash discards everything
        // before it. The leading dot is what keeps it relative; the slash is re-added first so a
        // stored value that lost it ('images/x.png') does not become the file '.images/x.png'.
        const relative = toPosixPath(imageUrl);
        const target = path.resolve(
            root,
            '.' + (relative.startsWith('/') ? relative : '/' + relative)
        );

        // Containment, not paranoia: `imageUrl` is a client-supplied string on the create/update
        // endpoints, `uri-reference` permits `/../../etc/passwd`, and the only thing standing
        // between that value and an unlink was previously a `+`. `path.resolve` has already
        // collapsed the `..` segments, so this compares the real destination. The public directory
        // itself is not a stored image, so equality is a rejection too.
        if (!target.startsWith(root + path.sep)) return Promise.resolve(false);

        return deleteFile(target);
    }
};

/**
 * The environment variable that switches storage over. Set it and the remote store is selected;
 * leave it unset and everything runs on local disk exactly as it does today.
 *
 * Named `NODE_IMAGE_STORE_*` rather than `NODE_S3_*` on purpose: the shape below is S3's because
 * every hosted bucket speaks it, but the intended first consumer is a personal CDN, and an
 * environment variable is a bad place to promise a vendor.
 */
const REMOTE_ENABLED_BY = 'NODE_IMAGE_STORE_BUCKET';

/** The rest of the remote configuration. Listed so a partial one can be reported as such. */
const REMOTE_REQUIRED = [
    'NODE_IMAGE_STORE_ENDPOINT',
    'NODE_IMAGE_STORE_KEY_ID',
    'NODE_IMAGE_STORE_SECRET',
    'NODE_IMAGE_STORE_PUBLIC_URL'
] as const;

/** Whether this deployment is asking for remote storage at all. */
export const isRemoteStoreConfigured = () => Boolean(process.env[REMOTE_ENABLED_BY]);

/**
 * TODO: implement the remote store — a personal CDN, or any S3-compatible bucket.
 *
 * Everything around it is already in place; this object is the whole of the remaining work. Two
 * methods, mirroring {@link filesystemImageStore}:
 *
 *   - `put(stagedPath)`: upload the staged file under the key `images/<basename>` with the right
 *     `Content-Type` (derive it from the extension — `extensionForImage` in
 *     `@core/adapters/image-signatures` is the mapping, read backwards), delete the staged file,
 *     and return `${NODE_IMAGE_STORE_PUBLIC_URL}/images/<basename>`. That returned value is the
 *     URL PREFIX CHANGE: rows written from here on hold an absolute url, while every existing row
 *     holds `/images/x.png`. Both are legal — `ImageUrl` in `openapi.yaml` is `uri-reference`
 *     precisely so both forms validate — and both must keep working, which is why
 *     `express.static` and the local branch of `remove` stay whatever else changes.
 *   - `remove(imageUrl)`: delete the object when the url is one of ours (starts with
 *     `NODE_IMAGE_STORE_PUBLIC_URL`), and hand a server-relative url to
 *     `filesystemImageStore.remove` instead — those are the legacy rows, and their files are still
 *     on disk. Anything else (an unrelated absolute url, a default image) stays a no-op.
 *
 * Worth deciding before writing it: an upload that succeeds and a database write that then fails
 * leaves an orphaned object. Locally that is cleaned up by `remove` on the failure path; against a
 * bucket the same call is a network round trip that can itself fail, so the durable answer is a
 * lifecycle rule (delete objects under a `staging/` prefix after a day) or a reaper job. Pick one
 * deliberately rather than discovering it as a storage bill.
 *
 * A note on the SDK: `@aws-sdk/client-s3` is not a dependency of this project, and adding it for
 * everyone to serve the few who configure a bucket is the trade this deliberately has not made.
 * Load it lazily here (`await import`) and declare it an optional peer dependency, or sign the two
 * requests by hand — `PUT`/`DELETE` with SigV4 is not much code when it is the only two you need.
 */
const remoteImageStore: IImageStore = {
    put: () => Promise.reject(new Error(describeMissingRemoteStore())),
    remove: () => Promise.reject(new Error(describeMissingRemoteStore()))
};

const describeMissingRemoteStore = () => {
    const missing = REMOTE_REQUIRED.filter((name) => !process.env[name]);
    return (
        `${REMOTE_ENABLED_BY} is set, but no remote image store is implemented — see the TODO in ` +
        `src/core/adapters/image-store.ts. Unset ${REMOTE_ENABLED_BY} to use local storage.` +
        (missing.length > 0 ? ` (Also unset or incomplete: ${missing.join(', ')}.)` : '')
    );
};

/**
 * Fail at boot rather than on the first upload.
 *
 * A misconfiguration that only surfaces when someone uploads a picture surfaces in production, on
 * a Tuesday, as a 500 with no obvious cause. Called from `app.ts`, where the process can still
 * refuse to start.
 */
export const assertImageStoreReady = () => {
    if (isRemoteStoreConfigured()) throw new Error(describeMissingRemoteStore());
};

/**
 * The store the application uses.
 *
 * Resolved per call rather than at import: an environment variable read at module load is a
 * variable that cannot be changed by a test, and half the value of this seam is being able to
 * exercise both branches.
 */
const activeStore = (): IImageStore =>
    isRemoteStoreConfigured() ? remoteImageStore : filesystemImageStore;

export const imageStore: IImageStore = {
    put: (stagedPath) => activeStore().put(stagedPath),
    remove: (imageUrl) => activeStore().remove(imageUrl)
};
