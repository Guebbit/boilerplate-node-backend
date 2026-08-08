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
 * One backend exists: the local one below. The file lands under `NODE_PUBLIC_PATH/images/` and the
 * stored value is the server-relative `/images/<name>` that `express.static` answers. A second
 * backend is a second object with these two methods — see the TODO above {@link imageStore}.
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
        // endpoints and `uri-reference` permits `/../../etc/passwd`. `path.resolve` has already
        // collapsed the `..` segments, so this compares the real destination. The public directory
        // itself is not a stored image, so equality is a rejection too.
        if (!target.startsWith(root + path.sep)) return Promise.resolve(false);

        return deleteFile(target);
    }
};

/**
 * The store the application uses.
 *
 * TODO: a second implementation, for images that outlive the container.
 *
 * Uploads currently land on the container's own filesystem. **Rebuild or remove the container and
 * every uploaded image goes with it** — `docker compose down -v`, a redeploy, a moved host. Only
 * `public/images/seed/` survives, because those are committed to the repository. Nothing else is
 * backed up by anything, and two replicas do not share what they store: an image uploaded to one is
 * a 404 on the other. A bind-mounted volume is the stopgap and works, but it pins the deployment to
 * one machine's disk.
 *
 * The fix is a second object with the two methods of {@link IImageStore} — a personal CDN is the
 * plan here, and any S3-compatible bucket would do — selected by whatever configuration it needs
 * (nothing is wired for that yet: there is no environment variable to set, on purpose, because a
 * switch that selects a backend nobody has written is a way to get a half-migrated deployment).
 * Everything else is already in place. When writing it:
 *
 *   - `put(stagedPath)` uploads the staged file under `images/<basename>` with the right
 *     `Content-Type` (derive it from the extension — `extensionForImage` in
 *     `@core/adapters/image-signatures` is that mapping, read backwards), deletes the staged file,
 *     and returns the public url of the object. That return value is a URL PREFIX CHANGE: rows
 *     written from then on hold an absolute url while every existing row holds `/images/x.png`.
 *     Both are legal — `ImageUrl` in `openapi.yaml` is `uri-reference` precisely so both validate —
 *     and both must keep working, which is why `express.static` and the local `remove` stay
 *     whatever else changes.
 *   - `remove(imageUrl)` deletes the object when the url is one of ours, and hands a
 *     server-relative url to {@link filesystemImageStore} instead: those are the legacy rows and
 *     their files are still on disk. Anything else — an unrelated absolute url, a default image —
 *     stays a no-op.
 *   - Anything that concatenates a base url onto `imageUrl` — a client renderer, a template, an
 *     email — has to skip that when the value already carries a scheme, or it produces
 *     `https://cdn.example.com/https://cdn.example.com/x.png`.
 *   - Decide up front what cleans up an object whose database write then failed. Locally the
 *     failure path deletes it; remotely that same call is a network round trip that can itself
 *     fail, so the durable answer is a lifecycle rule or a reaper job.
 *
 * And the reason a CDN url may be absolute when the local one deliberately is not: saving
 * `https://<current-host>/images/x.png` would bake the deployment's own hostname into every row, so
 * a domain change, a different proxy or a staging copy of the data would strand them all — a
 * migration to fix something that is not data. A CDN base url is chosen deliberately and does not
 * move when the API does, which is what makes it safe to persist.
 */
export const imageStore: IImageStore = filesystemImageStore;
