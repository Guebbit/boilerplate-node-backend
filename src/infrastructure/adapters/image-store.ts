/**
 * Image storage — the port every caller outside this module talks to.
 *
 * The rule that makes this worth having: **nothing outside this file may turn an `imageUrl` into a
 * filesystem path.** Spelling `deleteFile(NODE_PUBLIC_PATH + product.imageUrl)` in a service and
 * again in each write controller is what makes "move uploads to a bucket" a change to five files
 * instead of one. Here, the value persisted in `imageUrl` is an opaque handle: this module is the
 * only thing that knows
 * whether it names a file under `public/`, an object in a bucket, or something it does not own at
 * all.
 *
 * One backend exists: the local one below. The file lands under `NODE_PUBLIC_PATH/images/` and the
 * stored value is the server-relative `/images/<name>` that `express.static` answers. A second
 * backend is a second object with these two methods — see the TODO above {@link imageStore}.
 */

import path from 'node:path';
import { deleteFile, moveFile } from '@infrastructure/adapters/filesystem';
import { toPosixPath } from '@infrastructure/http/uploads';

export interface ImageStore {
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
 * is the configured default must not resolve it against the public directory and try to unlink
 * `public/https://…` — a path that only fails to do damage because the stat happens to miss.
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
export const filesystemImageStore: ImageStore = {
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

        // Containment: `imageUrl` is a client-supplied string on the create/update endpoints and
        // `uri-reference` permits `/../../etc/passwd`. `path.resolve` has already collapsed the
        // `..` segments, so this compares the real destination. The public directory itself is not
        // a stored image, so equality is a rejection too.
        //
        // Defence in depth, and deliberately kept as such: the directory check immediately below
        // is strictly stronger — it requires the parent to BE `<public>/images` — so removing this
        // line changes no observable behaviour today, and no test can isolate it. It stays because
        // it states the coarse invariant directly, and the check below is the one likely to be
        // relaxed later (nested keys, per-user folders) at which point this becomes load-bearing.
        if (!target.startsWith(root + path.sep)) return Promise.resolve(false);

        // Only files this store could have written. `put` always lands a single flat name in
        // `<public>/images/`, so anything in a SUBDIRECTORY of it belongs to someone else —
        // `images/seed/` holds the demo fixtures, which are committed repository assets. Replacing
        // a seeded record's image would otherwise unlink one permanently, leaving every later
        // re-seed pointing at a 404, and the deletion is unrecoverable outside version control.
        if (path.dirname(target) !== path.join(root, IMAGES_SEGMENT)) return Promise.resolve(false);

        return deleteFile(target);
    }
};

/**
 * The store the application uses.
 *
 * Uploads land on the container's own filesystem, so **rebuilding the container loses every
 * uploaded image** and two replicas do not share what they store. A mounted volume is the stopgap;
 * the durable answer is one more {@link ImageStore} implementation over an S3-compatible bucket or
 * a CDN, and nothing else.
 *
 * Nothing selects a backend yet, ON PURPOSE: a switch that offers one nobody has written is how a
 * deployment ends up half-migrated. The one trap worth knowing before starting is that `put` would
 * begin returning ABSOLUTE urls while every existing row holds `/images/x.png` — both are legal
 * (`ImageUrl` is a `uri-reference` for exactly this reason) and both have to keep working, which is
 * what `express.static` and the local `remove` are for.
 */
export const imageStore: ImageStore = filesystemImageStore;
