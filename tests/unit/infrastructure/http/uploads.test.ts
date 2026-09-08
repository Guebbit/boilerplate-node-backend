/**
 * Upload helpers — `src/infrastructure/http/uploads.ts`.
 *
 * `getFormFiles()` exists because multer populates three different request shapes depending on
 * which middleware variant a route used, and controllers should not have to know which. The
 * whole value of the function is that all three collapse to one type, so each shape is asserted
 * separately here — a regression that handles only two of them would still look fine on the
 * route that happens to use the third.
 */

import type { Request } from 'express';
import { getFormFiles, toPosixPath } from '@infrastructure/http/uploads';

/** A multer file stub — `path` is the only field these helpers touch. */
const uploaded = (path: string) => ({ path }) as Express.Multer.File;

/** Only `file` / `files` are read, so a partial Request is enough and keeps intent visible. */
const requestWith = (parts: Partial<Request>): Request => parts as Request;

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
     * The same normalization, through the OTHER multer shape — and the pair is the point.
     *
     * Without this normalization, `if (getFormFiles(req))` would answer differently depending on
     * which multer variant a route mounted — `[]` here against `undefined` from `.fields()` — the
     * exact distinction this function exists to hide. Harmless only by accident: both callers
     * happen to test `length === 0` as well as falsiness.
     *
     * Asserted next to the `.fields()` case above rather than merged into it: what has to hold
     * is that the two agree, and two assertions that can disagree are the only way to keep
     * proving it.
     */
    it('normalizes an empty array upload to undefined, exactly as a fields upload', () => {
        expect(getFormFiles(requestWith({ files: [] }))).toBeUndefined();
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
