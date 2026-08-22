/**
 * `storeUploadedImages` — the step between "multer wrote a file" and "the API has an image".
 *
 * It is the only place that turns a staged upload into a stored one, so its failure behaviour is
 * what decides whether a bad day leaves temp files, orphaned images, or database rows pointing at
 * nothing. Each of those is asserted here; the store itself is mocked, because what is under test
 * is the middleware's handling of it, not where bytes land.
 */
import type { NextFunction, Request, Response } from 'express';
import { storeUploadedImages } from '@infrastructure/adapters/storage';

jest.mock('@infrastructure/adapters/image-store', () => ({
    imageStore: { put: jest.fn(), remove: jest.fn() }
}));

jest.mock('@infrastructure/adapters/filesystem', () => ({
    deleteFile: jest.fn().mockResolvedValue(true),
    moveFile: jest.fn()
}));

const { imageStore } = jest.requireMock<{ imageStore: { put: jest.Mock; remove: jest.Mock } }>(
    '@infrastructure/adapters/image-store'
);
const { deleteFile } = jest.requireMock<{ deleteFile: jest.Mock }>(
    '@infrastructure/adapters/filesystem'
);

const uploaded = (filePath: string) => ({ path: filePath }) as Express.Multer.File;

/** Runs the middleware and resolves with whatever it passed to `next`. */
const run = (request: Partial<Request>) =>
    new Promise<unknown>((resolve) => {
        storeUploadedImages(request as Request, {} as Response, resolve as NextFunction);
    });

describe('storeUploadedImages', () => {
    it('commits a single upload and records the url on the request', async () => {
        imageStore.put.mockResolvedValue('/images/a.png');
        const request: Partial<Request> = { file: uploaded('/staging/a.png') };

        await expect(run(request)).resolves.toBeUndefined();

        expect(imageStore.put).toHaveBeenCalledWith('/staging/a.png');
        expect(request.storedImageUrls).toEqual(['/images/a.png']);
    });

    /* multer's three shapes again: `.array()` and `.fields()` both arrive as `request.files`. */
    it('commits every file of a multi-file upload, in order', async () => {
        imageStore.put.mockImplementation((staged: string) =>
            Promise.resolve('/images/' + staged.split('/').pop())
        );
        const request: Partial<Request> = {
            files: [uploaded('/staging/a.png'), uploaded('/staging/b.png')]
        };

        await run(request);

        expect(request.storedImageUrls).toEqual(['/images/a.png', '/images/b.png']);
    });

    it('passes straight through when the request carried no file', async () => {
        await expect(run({})).resolves.toBeUndefined();

        expect(imageStore.put).not.toHaveBeenCalled();
    });

    /**
     * A failed commit fails the request. The alternative — carry on with no image — writes a
     * product whose picture silently never existed, and does it on the happy path.
     */
    it('fails the request when the store rejects', async () => {
        const failure = new Error('bucket unreachable');
        imageStore.put.mockRejectedValue(failure);

        await expect(run({ file: uploaded('/staging/a.png') })).resolves.toBe(failure);
    });

    it('deletes the staged files when the store rejects', async () => {
        imageStore.put.mockRejectedValue(new Error('bucket unreachable'));

        await run({ files: [uploaded('/staging/a.png'), uploaded('/staging/b.png')] });

        // Nobody owns them now: the request is over and no url was recorded. Left behind, they are
        // a slow disk leak in a directory nobody looks at.
        expect(deleteFile).toHaveBeenCalledWith('/staging/a.png');
        expect(deleteFile).toHaveBeenCalledWith('/staging/b.png');
    });

    /**
     * The nastiest case: one file made it into storage and the other did not. The request fails, so
     * no row will ever name the one that succeeded — it has to be removed, or it is an orphan that
     * costs storage forever and that nothing can ever find again.
     */
    it('removes what it managed to store when a sibling upload fails', async () => {
        imageStore.put
            .mockResolvedValueOnce('/images/a.png')
            .mockRejectedValueOnce(new Error('disk full'));
        const request: Partial<Request> = {
            files: [uploaded('/staging/a.png'), uploaded('/staging/b.png')]
        };

        await expect(run(request)).resolves.toBeInstanceOf(Error);

        expect(request.storedImageUrls).toBeUndefined();
        expect(imageStore.remove).toHaveBeenCalledWith('/images/a.png');
        expect(deleteFile).toHaveBeenCalledTimes(2);
    });
});
