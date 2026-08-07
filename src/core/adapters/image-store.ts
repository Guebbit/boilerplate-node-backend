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
 * See TODO.md ("Move uploaded images to object storage / CDN"). The filesystem implementation below
 * is the behaviour that exists today; an S3-compatible one is a second implementation of the same
 * interface, and the callers do not change.
 */

import path from 'node:path';
import { deleteFile } from '@core/adapters/filesystem';
import { toPosixPath } from '@core/http/uploads';

export interface IImageStore {
    /**
     * Delete the stored image an `imageUrl` names.
     *
     * Never rejects, and never throws: cleanup runs on failure paths that are already answering an
     * error to the client, and a failed unlink must not become a second, different failure.
     *
     * @param imageUrl - the value as persisted on the document, or as produced for an upload that
     *   is about to be abandoned. Anything this store does not own is a no-op.
     * @returns whether something was actually deleted
     */
    remove(imageUrl: string | undefined): Promise<boolean>;
}

/**
 * Whether a value looks like a URL pointing somewhere else entirely.
 *
 * Two forms qualify: an absolute URL with a scheme (`https://cdn.example.com/x.png`, which is what
 * `NODE_DEFAULT_IMAGE_USER` / `NODE_DEFAULT_IMAGE_PRODUCT` hold, and what an S3 store will start
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
 * The store this API has always had: files under `NODE_PUBLIC_PATH`, served by `express.static`,
 * addressed by the public-relative path that `resolveImageUrl` strips down to
 * (`public/images/x.png` on disk → `/images/x.png` in the database).
 */
export const filesystemImageStore: IImageStore = {
    remove: (imageUrl) => {
        if (!imageUrl || isRemoteUrl(imageUrl)) return Promise.resolve(false);

        const root = path.resolve(process.env.NODE_PUBLIC_PATH ?? 'public');
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
 * The store the application uses.
 *
 * One line to redirect once a second implementation exists — at which point this becomes a lookup
 * on an environment variable, defaulting to the filesystem so the boilerplate keeps running with no
 * bucket, no credentials and no service to start.
 */
export const imageStore: IImageStore = filesystemImageStore;
