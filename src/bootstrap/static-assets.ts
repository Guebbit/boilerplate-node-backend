/**
 * Static file serving for uploads and other public assets.
 */

import express from 'express';
import type { Express } from 'express';

/**
 * Install the public asset handler.
 *
 * @param app - the express application to configure
 */
export const installStatic = (app: Express): void => {
    /**
     * Uploaded images and other public assets.
     *
     * Uploads were being written to `public/images/` and served by nothing, so every `imageUrl` this
     * API stored pointed at a URL it would not answer — the feature was half-built. Serving it here
     * keeps the guarantees in this repository, where the test suite can hold them, rather than in a
     * reverse proxy config that nothing here can see.
     *
     * What makes it safe is upstream of this line, not in it: a stored file's extension comes from
     * the declared type (a closed set of `png`/`jpg`/`webp`, see `resolveUploadFilename`), and its
     * bytes are verified to match before the request succeeds. `express.static` derives
     * `Content-Type` from the extension, so those two facts are what stop it ever answering
     * `text/html` from a path a stranger uploaded to.
     *
     * The options are the rest of it:
     * - `dotfiles: 'ignore'` — nothing beginning with `.` is served, so an `.env` or `.git` that ends
     *   up under `public/` by accident is a 404 rather than a disclosure.
     * - `index: false` — no implicit `index.html`, and no directory listing, so upload names stay
     *   unguessable rather than enumerable.
     * - `Cross-Origin-Resource-Policy: cross-origin` — helmet defaults every response to
     *   `same-origin`, which is right for JSON and wrong for an image the paired frontend loads from
     *   a different port. Without it the browser fetches the bytes and then refuses to render them.
     * - `immutable`, one year — filenames are 128 bits of randomness derived from nothing the client
     *   controls, so a given URL's bytes never change. Re-uploading produces a new name.
     */
    app.use(
        express.static(process.env.NODE_PUBLIC_PATH ?? 'public', {
            dotfiles: 'ignore',
            index: false,
            maxAge: '1y',
            immutable: true,
            setHeaders: (response) => {
                response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            }
        })
    );
};
