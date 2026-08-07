/**
 * Upload helpers — `src/core/http/uploads.ts`.
 *
 * `getFormFiles()` exists because multer populates three different request shapes depending on
 * which middleware variant a route used, and controllers should not have to know which. The
 * whole value of the function is that all three collapse to one type, so each shape is asserted
 * separately here — a regression that handles only two of them would still look fine on the
 * route that happens to use the third.
 *
 * `resolveImageUrl()` returns the public-relative URL and nothing else. It used to hand back the
 * filesystem path as well, for controllers to unlink on a failure; deletion now goes through
 * `@core/adapters/image-store`, which speaks stored URLs, so the path no longer leaves the upload
 * pipeline. Persisting one would bake the container's filesystem layout into database rows.
 */

import type { Request } from 'express';
import { getFormFiles, resolveImageUrl, toPosixPath } from '@core/http/uploads';

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
    const originalPublicPath = process.env.NODE_PUBLIC_PATH;

    afterEach(() => {
        if (originalPublicPath === undefined) delete process.env.NODE_PUBLIC_PATH;
        else process.env.NODE_PUBLIC_PATH = originalPublicPath;
    });

    it('strips the public prefix off the uploaded path', () => {
        delete process.env.NODE_PUBLIC_PATH;

        const result = resolveImageUrl(requestWith({ file: uploaded('public/images/a.png') }));

        // The stored value is a URL, never the path the file was written to: the filesystem
        // layout must not end up in the database.
        expect(result).toBe('/images/a.png');
    });

    it('strips a configured NODE_PUBLIC_PATH prefix instead of the default', () => {
        process.env.NODE_PUBLIC_PATH = '/srv/uploads';

        const result = resolveImageUrl(
            requestWith({ file: uploaded('/srv/uploads/images/a.png') })
        );

        expect(result).toBe('/images/a.png');
    });

    it('defaults the prefix to "public" when NODE_PUBLIC_PATH is unset', () => {
        delete process.env.NODE_PUBLIC_PATH;

        expect(resolveImageUrl(requestWith({ file: uploaded('public/x.png') }))).toBe('/x.png');
    });

    it('takes only the first file when several were uploaded', () => {
        // These endpoints accept a single image; extras are ignored rather than silently
        // overwriting each other downstream.
        const result = resolveImageUrl(
            requestWith({
                files: [uploaded('public/images/first.png'), uploaded('public/images/second.png')]
            })
        );

        expect(result).toBe('/images/first.png');
    });

    it('returns undefined when no file was uploaded', () => {
        // Callers distinguish "no image supplied" from "image supplied" on this being undefined,
        // so an empty string here would read as "an image at the site root" — and, worse, would
        // make the failure-path cleanup try to delete it.
        expect(resolveImageUrl(requestWith({}))).toBeUndefined();
    });

    it('replaces only the leading occurrence of the prefix', () => {
        // `String.replace` with a string pattern replaces the first match only — relied upon, so
        // pinned: a global replace would corrupt any filename that repeated the prefix.
        process.env.NODE_PUBLIC_PATH = 'public';

        expect(
            resolveImageUrl(requestWith({ file: uploaded('public/images/public-notice.png') }))
        ).toBe('/images/public-notice.png');
    });

    /**
     * The Windows case, which is the whole reason `imageUrl` is normalised at all.
     *
     * multer builds `file.path` with `path.join()`, so on Windows it arrives backslashed. The
     * value that gets PERSISTED must be a URL path or `express.static` answers 404 — and it does
     * so only on Windows, only in production data, and only once someone renders the image, which
     * is about as late as a bug can surface. These run on every platform because they feed the
     * helper a literal Windows-shaped string rather than asking the host what its separator is.
     */
    describe('separator normalisation', () => {
        it('converts a Windows path to a URL path when storing', () => {
            delete process.env.NODE_PUBLIC_PATH;

            const result = resolveImageUrl(
                requestWith({ file: uploaded(String.raw`public\images\a.png`) })
            );

            expect(result).toBe('/images/a.png');
        });

        it('matches a posix NODE_PUBLIC_PATH against a backslashed upload path', () => {
            // The prefix is normalised as well as the path, so the two agree on separators
            // whatever mix the platform and the configured value arrive in. Stripping before
            // normalising would leave this unmatched and persist the whole absolute path.
            process.env.NODE_PUBLIC_PATH = 'C:/srv/uploads';

            const result = resolveImageUrl(
                requestWith({ file: uploaded(String.raw`C:\srv\uploads\images\a.png`) })
            );

            expect(result).toBe('/images/a.png');
        });

        it('matches a backslashed NODE_PUBLIC_PATH against a backslashed upload path', () => {
            process.env.NODE_PUBLIC_PATH = String.raw`C:\srv\uploads`;

            const result = resolveImageUrl(
                requestWith({ file: uploaded(String.raw`C:\srv\uploads\images\a.png`) })
            );

            expect(result).toBe('/images/a.png');
        });

        it('never persists a backslash, whatever the inputs look like', () => {
            // The invariant the other cases are examples of. A stored value containing `\` is
            // broken by definition: it is read as part of the filename, not as a separator.
            process.env.NODE_PUBLIC_PATH = String.raw`C:\srv`;

            for (const path of [
                String.raw`C:\srv\images\a.png`,
                'C:/srv/images/a.png',
                String.raw`C:\srv/images\a.png`
            ])
                expect(resolveImageUrl(requestWith({ file: uploaded(path) }))).not.toMatch(/\\/);
        });
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
