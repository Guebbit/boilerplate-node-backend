/**
 * The image digest pipeline — `digestQuarantinedImage` (the shared pipeline), `handleImageDigestJob`
 * (the queue consumer) and `enqueueImageDigest` (what a module calls right after persisting a
 * document with a `pendingImageKey`).
 *
 * Mirrors `workers.test.ts`'s framing for the other two workers: the same three-outcome contract
 * (ack / dead-letter / requeue) applies here, plus a fourth case unique to this pipeline — a
 * writeback that matches no document, which must clean up the files it just promoted on BOTH the
 * queued and the inline path (see `settleWriteback`).
 *
 * sharp, the store and the queue are all mocked: what is under test is the pipeline's decisions,
 * not image encoding or persistence.
 */
import { logger } from '@infrastructure/adapters/logger';

jest.mock('@infrastructure/adapters/image-store', () => ({
    imageStore: {
        readQuarantined: jest.fn(),
        promote: jest.fn(),
        putDerivative: jest.fn(),
        removeQuarantined: jest.fn(),
        remove: jest.fn()
    }
}));

jest.mock('@infrastructure/adapters/image', () => ({
    digestImage: jest.fn(),
    thumbnailImage: jest.fn()
}));

jest.mock('@infrastructure/adapters/image-signatures', () => ({
    identifyImage: jest.fn()
}));

jest.mock('@infrastructure/adapters/queue', () => ({
    IMAGE_QUEUE: 'worker.image.digest',
    isQueueEnabled: jest.fn(),
    publishToQueue: jest.fn()
}));

jest.mock('@infrastructure/http/middlewares/cache', () => ({
    invalidateCacheTagsLogged: jest.fn()
}));

import { imageStore } from '@infrastructure/adapters/image-store';
import { digestImage, thumbnailImage } from '@infrastructure/adapters/image';
import { identifyImage } from '@infrastructure/adapters/image-signatures';
import { isQueueEnabled, publishToQueue } from '@infrastructure/adapters/queue';
import { invalidateCacheTagsLogged } from '@infrastructure/http/middlewares/cache';
import {
    digestQuarantinedImage,
    enqueueImageDigest,
    handleImageDigestJob,
    registerImageWritebackResolver,
    type ImageWriteback
} from '@infrastructure/adapters/image.worker';

const mockedReadQuarantined = imageStore.readQuarantined as jest.Mock;
const mockedPromote = imageStore.promote as jest.Mock;
const mockedPutDerivative = imageStore.putDerivative as jest.Mock;
const mockedRemoveQuarantined = imageStore.removeQuarantined as jest.Mock;
const mockedRemove = imageStore.remove as jest.Mock;
const mockedDigestImage = digestImage as jest.Mock;
const mockedThumbnailImage = thumbnailImage as jest.Mock;
const mockedIdentifyImage = identifyImage as jest.Mock;
const mockedIsQueueEnabled = isQueueEnabled as jest.Mock;
const mockedPublishToQueue = publishToQueue as jest.Mock;
const mockedInvalidateCacheTagsLogged = invalidateCacheTagsLogged as jest.Mock;

/** Wires the mocks to a happy-path digest: identifies as PNG, digests, thumbnails, promotes both. */
const primeSuccessfulDigest = () => {
    mockedReadQuarantined.mockResolvedValue(Buffer.from('raw bytes'));
    mockedIdentifyImage.mockReturnValue('image/png');
    mockedDigestImage.mockResolvedValue(Buffer.from('digested'));
    mockedThumbnailImage.mockResolvedValue(Buffer.from('thumbnail'));
    mockedPromote.mockResolvedValue('/images/abc123.png');
    mockedPutDerivative.mockResolvedValue('/images/thumbs/v1/abc123.webp');
    mockedRemoveQuarantined.mockResolvedValue(true);
};

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    jest.spyOn(logger, 'error').mockImplementation(() => logger);
    jest.spyOn(logger, 'info').mockImplementation(() => logger);
    jest.spyOn(logger, 'debug').mockImplementation(() => logger);
    mockedRemove.mockResolvedValue(true);
    mockedInvalidateCacheTagsLogged.mockResolvedValue(undefined);
});

afterAll(() => jest.restoreAllMocks());

describe('digestQuarantinedImage', () => {
    it('reads, identifies, digests and thumbnails, promotes both, then clears the quarantine file', async () => {
        primeSuccessfulDigest();

        await expect(digestQuarantinedImage('abc123.png')).resolves.toEqual({
            imageUrl: '/images/abc123.png',
            thumbnailUrl: '/images/thumbs/v1/abc123.webp'
        });

        expect(mockedReadQuarantined).toHaveBeenCalledWith('abc123.png');
        expect(mockedDigestImage).toHaveBeenCalledWith(Buffer.from('raw bytes'), 'image/png');
        expect(mockedThumbnailImage).toHaveBeenCalledWith(Buffer.from('raw bytes'));
        expect(mockedPromote).toHaveBeenCalledWith('abc123.png', Buffer.from('digested'));
        expect(mockedPutDerivative).toHaveBeenCalledWith('abc123.png', Buffer.from('thumbnail'));
        expect(mockedRemoveQuarantined).toHaveBeenCalledWith('abc123.png');
    });

    /* A magic-byte check already ran at upload time, but a payload smuggled past it, or bytes
       corrupted in quarantine, must not reach `digestImage` with a format it cannot re-encode. */
    it('rejects bytes that do not identify as an accepted format', async () => {
        mockedReadQuarantined.mockResolvedValue(Buffer.from('raw bytes'));
        mockedIdentifyImage.mockReturnValue(undefined);

        await expect(digestQuarantinedImage('abc123.bin')).rejects.toThrow(
            'does not match an accepted format'
        );
        expect(mockedDigestImage).not.toHaveBeenCalled();
    });
});

describe('handleImageDigestJob', () => {
    const writeback: jest.MockedFunction<ImageWriteback> = jest.fn();

    beforeEach(() => {
        writeback.mockReset();
        registerImageWritebackResolver((collection) =>
            collection === 'products' ? writeback : undefined
        );
    });

    const job = { collection: 'products', documentId: 'doc1', key: 'abc123.png' };

    it('digests, writes back and acks when the writeback matches', async () => {
        primeSuccessfulDigest();
        writeback.mockResolvedValue(true);

        await expect(handleImageDigestJob(job)).resolves.toBe(true);

        expect(writeback).toHaveBeenCalledWith('doc1', 'abc123.png', {
            imageUrl: '/images/abc123.png',
            thumbnailUrl: '/images/thumbs/v1/abc123.webp'
        });
        expect(mockedRemove).not.toHaveBeenCalled();
    });

    /**
     * The write that enqueued this job already cleared the `products` tag, before the digest ran
     * — so the response it re-warmed still carries the pre-digest placeholder. Clearing the tag
     * again here is what stops that placeholder surviving for the whole TTL (see `settleWriteback`).
     */
    it('invalidates the collection cache tag once the writeback matches', async () => {
        primeSuccessfulDigest();
        writeback.mockResolvedValue(true);

        await handleImageDigestJob(job);

        expect(mockedInvalidateCacheTagsLogged).toHaveBeenCalledWith(['products']);
    });

    /**
     * A stale or duplicate delivery, or a document deleted mid-flight: the writeback matches
     * nothing, so the files this run just promoted are unlinked rather than orphaned — and the
     * job still acks, since nothing about redelivering it would change the outcome.
     */
    it('cleans up the promoted files and still acks when the writeback matches nothing', async () => {
        primeSuccessfulDigest();
        writeback.mockResolvedValue(false);

        await expect(handleImageDigestJob(job)).resolves.toBe(true);

        expect(mockedRemove).toHaveBeenCalledWith('/images/abc123.png');
        expect(mockedInvalidateCacheTagsLogged).not.toHaveBeenCalled();
    });

    it.each([
        ['no collection', { documentId: 'doc1', key: 'abc123.png' }],
        ['no documentId', { collection: 'products', key: 'abc123.png' }],
        ['no key', { collection: 'products', documentId: 'doc1' }],
        ['an empty job', {}],
        ['a null job', null],
        ['an undefined job', undefined]
    ])('refuses a job with %s, without digesting', async (_label, malformed) => {
        await expect(
            handleImageDigestJob(malformed as Parameters<typeof handleImageDigestJob>[0])
        ).resolves.toBe(false);
        expect(mockedReadQuarantined).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalled();
    });

    it('discards a job naming a collection nothing registered', async () => {
        await expect(
            handleImageDigestJob({ collection: 'unknown', documentId: 'doc1', key: 'abc123.png' })
        ).resolves.toBe(false);

        expect(mockedReadQuarantined).not.toHaveBeenCalled();
        expect(writeback).not.toHaveBeenCalled();
    });

    /* A bad decode is permanent — every redelivery decodes the same bytes the same way — so it is
       dead-lettered (false) rather than left to reject, and the quarantine file is cleared. */
    it('dead-letters and clears quarantine when the digest itself fails', async () => {
        mockedReadQuarantined.mockResolvedValue(Buffer.from('raw bytes'));
        mockedIdentifyImage.mockReturnValue(undefined);
        mockedRemoveQuarantined.mockResolvedValue(true);

        await expect(handleImageDigestJob(job)).resolves.toBe(false);

        expect(mockedRemoveQuarantined).toHaveBeenCalledWith('abc123.png');
        expect(writeback).not.toHaveBeenCalled();
    });
});

describe('enqueueImageDigest', () => {
    const writeback: jest.MockedFunction<ImageWriteback> = jest.fn();
    const payload = { collection: 'products', documentId: 'doc1', key: 'abc123.png' };

    beforeEach(() => {
        writeback.mockReset();
    });

    it('publishes and returns without digesting when the broker accepts the job', async () => {
        mockedIsQueueEnabled.mockReturnValue(true);
        mockedPublishToQueue.mockResolvedValue(true);

        await enqueueImageDigest(payload, writeback);

        expect(mockedPublishToQueue).toHaveBeenCalledWith({
            queue: 'worker.image.digest',
            payload
        });
        expect(mockedReadQuarantined).not.toHaveBeenCalled();
        expect(writeback).not.toHaveBeenCalled();
    });

    it('runs the pipeline inline when no broker is configured', async () => {
        mockedIsQueueEnabled.mockReturnValue(false);
        primeSuccessfulDigest();
        writeback.mockResolvedValue(true);

        await enqueueImageDigest(payload, writeback);

        expect(mockedPublishToQueue).not.toHaveBeenCalled();
        expect(writeback).toHaveBeenCalledWith('doc1', 'abc123.png', {
            imageUrl: '/images/abc123.png',
            thumbnailUrl: '/images/thumbs/v1/abc123.webp'
        });
        // Same `settleWriteback` path as the queued job — the inline fallback must invalidate too.
        expect(mockedInvalidateCacheTagsLogged).toHaveBeenCalledWith(['products']);
    });

    /* Same fallback `enqueueEmail` takes: a broker that is configured but momentarily unreachable
       must not leave the record stuck on its placeholder with no job ever dispatched. */
    it('falls back to inline when the broker is configured but the publish fails', async () => {
        mockedIsQueueEnabled.mockReturnValue(true);
        mockedPublishToQueue.mockResolvedValue(false);
        primeSuccessfulDigest();
        writeback.mockResolvedValue(true);

        await enqueueImageDigest(payload, writeback);

        expect(writeback).toHaveBeenCalledWith('doc1', 'abc123.png', {
            imageUrl: '/images/abc123.png',
            thumbnailUrl: '/images/thumbs/v1/abc123.webp'
        });
    });

    /* The gap this file's own docblock calls out: the inline path shares `settleWriteback` with
       the queued one, so a stale/mismatched writeback cleans up here too, not only off the queue. */
    it('cleans up the promoted files when the inline writeback matches nothing', async () => {
        mockedIsQueueEnabled.mockReturnValue(false);
        primeSuccessfulDigest();
        writeback.mockResolvedValue(false);

        await enqueueImageDigest(payload, writeback);

        expect(mockedRemove).toHaveBeenCalledWith('/images/abc123.png');
        expect(mockedInvalidateCacheTagsLogged).not.toHaveBeenCalled();
    });
});
