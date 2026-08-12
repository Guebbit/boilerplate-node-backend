/**
 * Upload helpers — `src/infrastructure/http/uploads.ts`.
 *
 * `getFormFiles()` exists because multer populates three different request shapes depending on
 * which middleware variant a route used, and controllers should not have to know which. The
 * whole value of the function is that all three collapse to one type, so each shape is asserted
 * separately here — a regression that handles only two of them would still look fine on the
 * route that happens to use the third.
 *
 * `resolveImageUrl()` reads back the url the image store recorded when it committed the upload —
 * it neither derives that url from multer's path nor hands the path back. The store constructs the
 * url and owns the delete, so no filesystem path leaves the upload pipeline and none can reach a
 * database row.
 */

import type { Request } from 'express';
import { getFormFiles, resolveImageUrl, toPosixPath } from '@infrastructure/http/uploads';

/** Only `file` / `files` are read, so a partial Request is enough and keeps intent visible. */
const requestWith = (parts: Partial<Request>): Request => parts as Request;

/** A multer file stub — `path` is the only field these helpers touch. */
const uploaded = (path: string) => ({ path }) as Express.Multer.File;

describe('getFormFiles', () => {
    it('wraps a single-file upload (multer.single) in an array', () => {
        const files = getFormFiles(requestWith({ file: uploaded('public/images/a.png') }));

        // The uniform return type is the point: callers must never have to branch on shape.
        expect(files).toEqual(['public/images/a.png']);
    });

    it('maps an array upload (multer.array) to its paths in order', () => {
        const files = getFormFiles(
            requestWith({
                files: [uploaded('public/images/a.png'), uploaded('public/images/b.png')]
            })
        );

        expect(files).toEqual(['public/images/a.png', 'public/images/b.png']);
    });

    it('flattens a fields upload (multer.fields) across every field', () => {
        // The keyed-object shape: callers want paths, not the field structure.
        const files = getFormFiles(
            requestWith({
                files: {
                    avatar: [uploaded('public/images/avatar.png')],
                    gallery: [uploaded('public/images/g1.png'), uploaded('public/images/g2.png')]
                }
            })
        );

        expect(files).toEqual([
            'public/images/avatar.png',
            'public/images/g1.png',
            'public/images/g2.png'
        ]);
    });

    it('prefers request.file over request.files when both are somehow present', () => {
        // Documented order of checks. Asserted so the precedence cannot silently invert.
        const files = getFormFiles(
            requestWith({
                file: uploaded('public/images/single.png'),
                files: [uploaded('public/images/other.png')]
            })
        );

        expect(files).toEqual(['public/images/single.png']);
    });

    it('returns undefined when nothing was uploaded', () => {
        expect(getFormFiles(requestWith({}))).toBeUndefined();
    });

    it('normalizes a fields upload whose every field is empty to undefined', () => {
        // "Normalize present-but-empty to undefined so callers have one falsy case to check."
        expect(getFormFiles(requestWith({ files: { avatar: [], gallery: [] } }))).toBeUndefined();
    });

    /**
     * INCONSISTENCY — pinned, not endorsed.
     *
     * The docblock promises "present but empty → undefined so callers have one falsy case to
     * check", but only the `.fields()` branch does it. The `.array()` branch returns `[]`
     * unchanged, and `[]` is truthy — so `if (getFormFiles(req))` behaves differently depending
     * on which multer variant the route used, which is the exact distinction this function
     * exists to hide.
     *
     * Harmless today: the only caller is `resolveImageUrl`, whose `?.[0]` handles both. Pinned
     * rather than fixed because fixing it is a source change, not a test change — see the
     * accompanying report for the one-line fix.
     */
    it('returns an empty array (NOT undefined) for an empty array upload', () => {
        expect(getFormFiles(requestWith({ files: [] }))).toEqual([]);
    });
});

describe('resolveImageUrl', () => {
    /**
     * Reads back what the image store committed, and nothing else. The store CONSTRUCTS the url
     * (`@infrastructure/adapters/image-store`), so there is no path to normalise here and no way for a
     * filesystem separator to reach a stored value — `image-store.test.ts` asserts that property.
     */
    it('returns the url the store recorded for the upload', () => {
        expect(resolveImageUrl(requestWith({ storedImageUrls: ['/images/a.png'] }))).toBe(
            '/images/a.png'
        );
    });

    /* A remote store answers absolute urls, and controllers must not be able to tell. */
    it('returns an absolute url unchanged', () => {
        expect(
            resolveImageUrl(
                requestWith({ storedImageUrls: ['https://cdn.example.com/images/a.png'] })
            )
        ).toBe('https://cdn.example.com/images/a.png');
    });

    it('takes only the first url when several images were committed', () => {
        // These endpoints accept a single image; extras are ignored rather than silently
        // overwriting each other downstream.
        expect(
            resolveImageUrl(
                requestWith({ storedImageUrls: ['/images/first.png', '/images/second.png'] })
            )
        ).toBe('/images/first.png');
    });

    it('returns undefined when the request uploaded nothing', () => {
        // Callers distinguish "no image supplied" from "image supplied" on this being undefined,
        // so an empty string here would read as "an image at the site root" — and, worse, would
        // make the failure-path cleanup try to delete it.
        expect(resolveImageUrl(requestWith({}))).toBeUndefined();
    });

    /**
     * The staged path is deliberately NOT a fallback. A request whose upload never reached the
     * store has no stored image, and answering with the temp path would persist a filesystem path
     * into `imageUrl` — the exact bug the store exists to make impossible.
     */
    it('ignores a staged file the store never committed', () => {
        expect(
            resolveImageUrl(requestWith({ file: uploaded('/tmp/staging/a.png') }))
        ).toBeUndefined();
    });
});

describe('toPosixPath', () => {
    it('rewrites every separator, not just the first', () => {
        expect(toPosixPath(String.raw`a\b\c\d.png`)).toBe('a/b/c/d.png');
    });

    it('leaves an already-posix path untouched', () => {
        // Idempotence matters: the helper runs on values that may already have been through it.
        expect(toPosixPath('/images/a.png')).toBe('/images/a.png');
    });

    it('leaves a path with no separators at all untouched', () => {
        expect(toPosixPath('a.png')).toBe('a.png');
    });
});
