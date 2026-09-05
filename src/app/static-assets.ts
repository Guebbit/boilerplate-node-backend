/**
 * @module
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
     * Served here rather than by a reverse proxy so the guarantees stay where the test suite can
     * hold them. What makes it safe is upstream: a stored file's extension comes from a closed set
     * (`resolveUploadFilename`) and its bytes are verified to match, so `express.static` — which
     * derives `Content-Type` from the extension — can never answer `text/html` from an upload path.
     *
     * The options:
     * - `dotfiles: 'ignore'` — a stray `.env` under `public/` is a 404, not a disclosure.
     * - `index: false` — no directory listing, so upload names stay unguessable.
     * - `Cross-Origin-Resource-Policy: cross-origin` — helmet defaults to `same-origin`, which is
     *   right for JSON and wrong for an image the paired frontend loads from another port.
     * - `immutable`, one year — filenames are 128 bits of randomness, so a URL's bytes never change.
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
