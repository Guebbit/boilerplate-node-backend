/**
 * `quarantineUploadedImages` — the step between "multer wrote a file" and "the API has an image".
 *
 * It is the only place that turns a staged upload into a quarantined one, and — whenever the queue
 * isn't `ready` (no broker configured, unreachable, or still connecting) — the only place that
 * digests it inline. Each failure mode is asserted here; the
 * store and the digest pipeline are mocked, because what is under test is the middleware's
 * handling of them, not where bytes land or how they are re-encoded.
 */
import type { NextFunction, Request, Response } from 'express';
import { quarantineUploadedImages } from '@infrastructure/http/middlewares/upload';

jest.mock('@infrastructure/adapters/image-store', () => ({
    imageStore: { quarantine: jest.fn(), removeQuarantined: jest.fn() }
}));

jest.mock('@infrastructure/adapters/filesystem', () => ({
    deleteFile: jest.fn().mockResolvedValue(true),
    moveFile: jest.fn()
}));

jest.mock('@infrastructure/adapters/queue', () => ({
    queueState: jest.fn(),
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
const { queueState } = jest.requireMock<{ queueState: jest.Mock }>(
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

describe('quarantineUploadedImages — broker ready', () => {
    beforeEach(() => {
        queueState.mockReturnValue('ready');
    });

    it('commits a single upload and records its key on the request', async () => {
        imageStore.quarantine.mockResolvedValue('a.png');
        const request: Partial<Request> = { file: uploaded('/staging/a.png') };

        await expect(run(request)).resolves.toBeUndefined();

        expect(imageStore.quarantine).toHaveBeenCalledWith('/staging/a.png');
        expect(request.quarantinedImageKeys).toEqual(['a.png']);
        expect(digestQuarantinedImage).not.toHaveBeenCalled();
    });

    it('passes straight through when the request carried no file', async () => {
        await expect(run({})).resolves.toBeUndefined();

        expect(imageStore.quarantine).not.toHaveBeenCalled();
    });

    /**
     * A failed commit fails the request. The alternative — carry on with no image — writes a
     * product whose picture silently never existed, and does it on the happy path.
     */
    it('fails the request when the store rejects, and deletes the staged file', async () => {
        const failure = new Error('disk full');
        imageStore.quarantine.mockRejectedValue(failure);

        await expect(run({ file: uploaded('/staging/a.png') })).resolves.toBe(failure);

        // Nobody owns it now: the request is over and no key was recorded. Left behind, it is a
        // slow disk leak in a directory nobody looks at.
        expect(deleteFile).toHaveBeenCalledWith('/staging/a.png');
    });

    /*
     * The cleanup step itself is a promise chain with no `.catch()` of its own — without one on
     * the middleware's own outer chain, a rejection here never reaches `next()` and the request
     * just hangs, rather than answering the 500 an ordinary thrown error would.
     */
    it('still reaches next() when the cleanup itself rejects', async () => {
        imageStore.quarantine.mockRejectedValue(new Error('disk full'));
        deleteFile.mockRejectedValueOnce(new Error('cleanup also failed'));

        await expect(run({ file: uploaded('/staging/a.png') })).resolves.toBeInstanceOf(Error);
    });
});

describe('quarantineUploadedImages — no broker ready', () => {
    beforeEach(() => {
        queueState.mockReturnValue('disabled');
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

        // Owner is the key's STEM ('a'), not the key itself ('a.png'): `image-store.ts#promote`
        // appends the digested mime's own extension to it, and passing the key whole would double
        // it — see `digestQuarantinedKeysInline`'s own comment.
        expect(digestQuarantinedImage).toHaveBeenCalledWith('a.png', 'a');
        expect(request.storedImageUrls).toEqual(['/images/a.png']);
        expect(request.storedThumbnailUrls).toEqual(['/images/thumbs/v1/a.webp']);
        expect(request.quarantinedImageKeys).toBeUndefined();
    });

    /**
     * A broker that is configured but not reachable routes exactly like no broker at all. Handing
     * it a pending key instead answers before the file exists — the race a later write turns into
     * a deleted image.
     */
    it.each(['unavailable', 'connecting'])(
        'digests inline while the broker is %s, rather than leaving a pending key',
        async (state) => {
            queueState.mockReturnValue(state);
            imageStore.quarantine.mockResolvedValue('a.png');
            digestQuarantinedImage.mockResolvedValue({
                imageUrl: '/images/a.png',
                thumbnailUrl: '/images/thumbs/v1/a.webp'
            });
            const request: Partial<Request> = { file: uploaded('/staging/a.png') };

            await run(request);

            expect(digestQuarantinedImage).toHaveBeenCalledWith('a.png', 'a');
            expect(request.quarantinedImageKeys).toBeUndefined();
        }
    );

    /**
     * A quarantine key with a multi-dot original name (`resolveUploadFilename` only ever mints
     * `<hex>.<ext>`, but the stem-stripping must not assume exactly one dot) still salts with
     * everything before the LAST extension — regression coverage for the bug this fixed: passing
     * the raw key doubled the extension (`<hex>.png-<hash>.png`) whenever the queue was not ready.
     */
    it('strips only the final extension off a quarantine key with dots in its stem', async () => {
        imageStore.quarantine.mockResolvedValue('a.b.png');
        digestQuarantinedImage.mockResolvedValue({
            imageUrl: '/images/a.b-hash.png',
            thumbnailUrl: '/images/thumbs/v1/a.b-hash.webp'
        });

        await run({ file: uploaded('/staging/a.b.png') });

        expect(digestQuarantinedImage).toHaveBeenCalledWith('a.b.png', 'a.b');
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
