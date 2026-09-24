/**
 * Upload helpers — `src/infrastructure/http/uploads.ts`.
 *
 * `getFormFiles()` wraps `request.file` in an array so controllers get a uniform return type
 * regardless of whether anything was uploaded — `upload.image()` is the only middleware every
 * route mounts, and it always populates `request.file`, never `request.files`.
 *
 * `readUploadedImage()` reads back what the upload middleware recorded — it neither derives the
 * url from multer's path nor hands the path back. The store constructs the url and owns the
 * delete, so no filesystem path leaves the upload pipeline and none can reach a database row.
 */

import type { Request } from 'express';
import { getFormFiles, readUploadedImage } from '@infrastructure/http/uploads';

/** A multer file stub — `path` is the only field these helpers touch. */
const uploaded = (path: string) => ({ path }) as Express.Multer.File;

/**
 * A partial Request stub, `body` defaulted to `{}` so `readUploadedImage`'s own fallback branch
 * (which reads `request.body.imageUrl`) never sees `undefined` — `getFormFiles`'s cases never
 * read `body` at all, so the default changes nothing for them.
 */
const requestWith = (parts: Partial<Request>): Request => ({ body: {}, ...parts }) as Request;

describe('getFormFiles', () => {
    it('wraps a single-file upload (multer.single) in an array', () => {
        const files = getFormFiles(requestWith({ file: uploaded('public/images/a.png') }));

        // The uniform return type is the point: callers must never have to branch on shape.
        expect(files).toEqual(['public/images/a.png']);
    });

    it('returns undefined when nothing was uploaded', () => {
        expect(getFormFiles(requestWith({}))).toBeUndefined();
    });
});

describe('readUploadedImage', () => {
    it('returns the url the store recorded for the upload', () => {
        expect(
            readUploadedImage(requestWith({ storedImageUrls: ['/images/a.png'] })).imageUrl
        ).toBe('/images/a.png');
    });

    /* A remote store answers absolute urls, and controllers must not be able to tell. */
    it('returns an absolute url unchanged', () => {
        expect(
            readUploadedImage(
                requestWith({ storedImageUrls: ['https://cdn.example.com/images/a.png'] })
            ).imageUrl
        ).toBe('https://cdn.example.com/images/a.png');
    });

    it('takes only the first url when several images were committed', () => {
        // These endpoints accept a single image; extras are ignored rather than silently
        // overwriting each other downstream.
        expect(
            readUploadedImage(
                requestWith({ storedImageUrls: ['/images/first.png', '/images/second.png'] })
            ).imageUrl
        ).toBe('/images/first.png');
    });

    it('returns undefined when the request uploaded nothing', () => {
        // Callers distinguish "no image supplied" from "image supplied" on this being undefined,
        // so an empty string here would read as "an image at the site root" — and, worse, would
        // make the failure-path cleanup try to delete it.
        expect(readUploadedImage(requestWith({})).imageUrl).toBeUndefined();
    });

    /**
     * The staged path is deliberately NOT a fallback. A request whose upload never reached the
     * store has no stored image, and answering with the temp path would persist a filesystem path
     * into `imageUrl` — the exact bug the store exists to make impossible.
     */
    it('ignores a staged file the store never committed', () => {
        expect(
            readUploadedImage(
                requestWith({ file: { path: '/tmp/staging/a.png' } as Express.Multer.File })
            ).imageUrl
        ).toBeUndefined();
    });
});
