/**
 * `quarantineUploadedImages` — the step between "multer wrote a file" and "the API has an image".
 *
 * It is the only place that turns a staged upload into a quarantined one, and — with no broker
 * configured — the only place that digests it inline. Each failure mode is asserted here; the
 * store and the digest pipeline are mocked, because what is under test is the middleware's
 * handling of them, not where bytes land or how they are re-encoded.
 */
import type { NextFunction, Request, Response } from 'express';
import { quarantineUploadedImages } from '@infrastructure/adapters/storage';

jest.mock('@infrastructure/adapters/image-store', () => ({
    imageStore: { quarantine: jest.fn(), removeQuarantined: jest.fn() }
}));

jest.mock('@infrastructure/adapters/filesystem', () => ({
    deleteFile: jest.fn().mockResolvedValue(true),
    moveFile: jest.fn()
}));

jest.mock('@infrastructure/adapters/queue', () => ({
    isQueueEnabled: jest.fn(),
    publishToQueue: jest.fn()
}));

jest.mock('@infrastructure/adapters/image.worker', () => ({
    digestQuarantinedImage: jest.fn()
}));

const { imageStore } = jest.requireMock<{
    imageStore: { quarantine: jest.Mock; removeQuarantined: jest.Mock };
}>('@infrastructure/adapters/image-store');
const { deleteFile } = jest.requireMock<{ deleteFile: jest.Mock }>(
    '@infrastructure/adapters/filesystem'
);
const { isQueueEnabled } = jest.requireMock<{ isQueueEnabled: jest.Mock }>(
    '@infrastructure/adapters/queue'
);
const { digestQuarantinedImage } = jest.requireMock<{ digestQuarantinedImage: jest.Mock }>(
    '@infrastructure/adapters/image.worker'
);

const uploaded = (filePath: string) => ({ path: filePath }) as Express.Multer.File;

/** Runs the middleware and resolves with whatever it passed to `next`. */
const run = (request: Partial<Request>) =>
    new Promise<unknown>((resolve) => {
        quarantineUploadedImages(request as Request, {} as Response, resolve as NextFunction);
    });

describe('quarantineUploadedImages — broker configured', () => {
    beforeEach(() => {
        isQueueEnabled.mockReturnValue(true);
    });

    it('commits a single upload and records its key on the request', async () => {
        imageStore.quarantine.mockResolvedValue('a.png');
        const request: Partial<Request> = { file: uploaded('/staging/a.png') };

        await expect(run(request)).resolves.toBeUndefined();

        expect(imageStore.quarantine).toHaveBeenCalledWith('/staging/a.png');
        expect(request.quarantinedImageKeys).toEqual(['a.png']);
        expect(digestQuarantinedImage).not.toHaveBeenCalled();
    });

    /* multer's three shapes again: `.array()` and `.fields()` both arrive as `request.files`. */
    it('commits every file of a multi-file upload, in order', async () => {
        imageStore.quarantine.mockImplementation((staged: string) =>
            Promise.resolve(staged.split('/').pop())
        );
        const request: Partial<Request> = {
            files: [uploaded('/staging/a.png'), uploaded('/staging/b.png')]
        };

        await run(request);

        expect(request.quarantinedImageKeys).toEqual(['a.png', 'b.png']);
    });

    it('passes straight through when the request carried no file', async () => {
        await expect(run({})).resolves.toBeUndefined();

        expect(imageStore.quarantine).not.toHaveBeenCalled();
    });

    /**
     * A failed commit fails the request. The alternative — carry on with no image — writes a
     * product whose picture silently never existed, and does it on the happy path.
     */
    it('fails the request when the store rejects', async () => {
        const failure = new Error('disk full');
        imageStore.quarantine.mockRejectedValue(failure);

        await expect(run({ file: uploaded('/staging/a.png') })).resolves.toBe(failure);
    });

    it('deletes the staged files when the store rejects', async () => {
        imageStore.quarantine.mockRejectedValue(new Error('disk full'));

        await run({ files: [uploaded('/staging/a.png'), uploaded('/staging/b.png')] });

        // Nobody owns them now: the request is over and no key was recorded. Left behind, they are
        // a slow disk leak in a directory nobody looks at.
        expect(deleteFile).toHaveBeenCalledWith('/staging/a.png');
        expect(deleteFile).toHaveBeenCalledWith('/staging/b.png');
    });

    /**
     * The nastiest case: one file made it into quarantine and the other did not. The request
     * fails, so no row will ever name the one that succeeded — it has to be removed, or it is an
     * orphan nothing can ever find again.
     */
    it('removes what it managed to quarantine when a sibling upload fails', async () => {
        imageStore.quarantine
            .mockResolvedValueOnce('a.png')
            .mockRejectedValueOnce(new Error('disk full'));
        const request: Partial<Request> = {
            files: [uploaded('/staging/a.png'), uploaded('/staging/b.png')]
        };

        await expect(run(request)).resolves.toBeInstanceOf(Error);

        expect(request.quarantinedImageKeys).toBeUndefined();
        expect(imageStore.removeQuarantined).toHaveBeenCalledWith('a.png');
        expect(deleteFile).toHaveBeenCalledTimes(2);
    });
});

describe('quarantineUploadedImages — no broker configured', () => {
    beforeEach(() => {
        isQueueEnabled.mockReturnValue(false);
    });

    /**
     * The contract promises a real `thumbnailUrl` regardless of whether RabbitMQ is running, so
     * with no broker the digest has to happen right here, before the request is allowed to reach
     * the controller.
     */
    it('digests inline and records the promoted urls, never a pending key', async () => {
        imageStore.quarantine.mockResolvedValue('a.png');
        digestQuarantinedImage.mockResolvedValue({
            imageUrl: '/images/a.png',
            thumbnailUrl: '/images/thumbs/v1/a.webp'
        });
        const request: Partial<Request> = { file: uploaded('/staging/a.png') };

        await expect(run(request)).resolves.toBeUndefined();

        expect(digestQuarantinedImage).toHaveBeenCalledWith('a.png');
        expect(request.storedImageUrls).toEqual(['/images/a.png']);
        expect(request.storedThumbnailUrls).toEqual(['/images/thumbs/v1/a.webp']);
        expect(request.quarantinedImageKeys).toBeUndefined();
    });

    it('digests every file of a multi-file upload inline, in order', async () => {
        imageStore.quarantine.mockImplementation((staged: string) =>
            Promise.resolve(staged.split('/').pop())
        );
        digestQuarantinedImage.mockImplementation((key: string) =>
            Promise.resolve({
                imageUrl: `/images/${key}`,
                thumbnailUrl: `/images/thumbs/v1/${key}`
            })
        );
        const request: Partial<Request> = {
            files: [uploaded('/staging/a.png'), uploaded('/staging/b.png')]
        };

        await run(request);

        expect(request.storedImageUrls).toEqual(['/images/a.png', '/images/b.png']);
        expect(request.storedThumbnailUrls).toEqual([
            '/images/thumbs/v1/a.png',
            '/images/thumbs/v1/b.png'
        ]);
    });

    /**
     * A bad decode fails the request exactly as a rejected quarantine does — the quarantine file
     * this failure leaves behind is cleaned up rather than left for the reaper.
     */
    it('cleans up the quarantine file and fails the request when the digest rejects', async () => {
        imageStore.quarantine.mockResolvedValue('a.png');
        const failure = new Error('unsupported format');
        digestQuarantinedImage.mockRejectedValue(failure);

        await expect(run({ file: uploaded('/staging/a.png') })).resolves.toBe(failure);

        expect(imageStore.removeQuarantined).toHaveBeenCalledWith('a.png');
    });
});
