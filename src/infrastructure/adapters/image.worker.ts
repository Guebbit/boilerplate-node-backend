/**
 * @module
 * Turns a quarantined upload into its promoted original plus thumbnail, then writes the result
 * back onto the waiting document. `digestQuarantinedImage` is the one pipeline; the queued worker
 * (`handleImageDigestJob`) and the no-broker inline path (`enqueueImageDigest`) both share it.
 * Since this file sits below `@kernel`/`@modules` and cannot import either, the writeback is an
 * inverted port — {@link ImageWriteback} plus a registration function — supplied at boot by
 * `app/workers.ts`.
 *
 * See: IMAGE_PIPELINE_PLAN.md, docs/tools/image-processing.md
 */

import type { ImageDigestJobPayload } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import { imageStore } from '@infrastructure/adapters/image-store';
import { digestImage, thumbnailImage } from '@infrastructure/adapters/image';
import type { ReencodableImageMime } from '@infrastructure/adapters/image';
import { identifyImage } from '@infrastructure/adapters/image-signatures';
import { IMAGE_QUEUE, isQueueEnabled, publishToQueue } from '@infrastructure/adapters/queue';
import { invalidateCacheTagsLogged } from '@infrastructure/http/middlewares/cache';

/* Queue name for image digest jobs — owned by the adapter, re-exported for the worker registry. */
export { IMAGE_QUEUE } from '@infrastructure/adapters/queue';

/** The only formats `digestImage` can re-encode — see `ReencodableImageMime`. */
const REENCODABLE_MIMES: ReadonlySet<string> = new Set<ReencodableImageMime>([
    'image/png',
    'image/jpeg',
    'image/webp'
]);

const isReencodableMime = (mime: string | undefined): mime is ReencodableImageMime =>
    mime !== undefined && REENCODABLE_MIMES.has(mime);

/** The two urls a finished digest produces, ready to persist. */
export interface DigestedImageUrls {
    /** The promoted original's url. */
    imageUrl: string;
    /** The promoted thumbnail's url. */
    thumbnailUrl: string;
}

/**
 * A module's writeback for one collection — see the module docblock above for why this is
 * declared here rather than imported from `kernel/registry.ts`'s `ImageTarget`. Kept structurally
 * identical to it on purpose: the two describe the same function.
 *
 * @returns whether a document actually matched `documentId` AND `key` and was updated
 */
export type ImageWriteback = (
    documentId: string,
    key: string,
    urls: DigestedImageUrls
) => Promise<boolean>;

/**
 * Resolves a job's `collection` field to the module writeback that should handle it. `undefined`
 * until `registerImageWritebackResolver` runs — the state every test importing this module starts
 * in, and the state a job arriving before boot finishes wiring would see.
 */
let resolveWriteback: ((collection: string) => ImageWriteback | undefined) | undefined;

/**
 * Install the collection resolver. Called once, at boot, from `app/workers.ts`, with a function
 * built from `resolveImageTargets(enabledModules)` — the one place allowed to know every module.
 *
 * @param resolver - looks up a module's writeback by the job's `collection` field
 */
export const registerImageWritebackResolver = (
    resolver: (collection: string) => ImageWriteback | undefined
): void => {
    resolveWriteback = resolver;
};

/**
 * Run the whole digest pipeline for one quarantined upload: read, identify, digest, thumbnail,
 * promote both, then clear the quarantine file. Shared by the queued worker and the no-broker
 * inline fallback, so both run exactly one pipeline rather than two that could drift apart.
 *
 * @param key - the quarantine key {@link imageStore.quarantine} returned
 * @throws When the bytes will never decode as one of the three accepted formats (the caller
 *   dead-letters/discards), or on any storage failure (the caller retries).
 */
export const digestQuarantinedImage = (key: string): Promise<DigestedImageUrls> =>
    imageStore.readQuarantined(key).then((raw) => {
        const mime = identifyImage(raw);
        if (!isReencodableMime(mime))
            throw new Error(`Quarantined image ${key} does not match an accepted format.`);

        return Promise.all([digestImage(raw, mime), thumbnailImage(raw)])
            .then(([digested, thumbnail]) =>
                Promise.all([
                    imageStore.promote(key, digested),
                    imageStore.putDerivative(key, thumbnail)
                ])
            )
            .then(([imageUrl, thumbnailUrl]) =>
                // Best-effort: the promoted files are what matters, and a leftover quarantine file
                // is cleaned up later by `ops/reap-quarantine.ts` regardless.
                imageStore.removeQuarantined(key).then(() => ({ imageUrl, thumbnailUrl }))
            );
    });

/**
 * Call a module's writeback, and either clean up (nothing matched) or invalidate the cache
 * (something did) — the two outcomes a finished digest can have.
 *
 * Shared by {@link handleImageDigestJob} and {@link enqueueImageDigest}'s inline fallback, so a
 * stale job, a deleted-mid-flight document, and a completed digest are all handled identically on
 * both paths.
 *
 * The invalidation half exists because the write that enqueued this job already cleared the
 * `collection` cache tag — before the digest ran, so the response it re-warmed still carries the
 * pre-digest placeholder (`imageUrl`/`thumbnailUrl` not yet set). This is the only place a
 * FINISHED digest becomes visible to anything, so it is the only place that can clear the tag a
 * second time; without it, a cached response can serve that placeholder for the tag's whole TTL.
 *
 * @param writeback - the module's own writeback
 * @param documentId - the target document's id
 * @param key - the quarantine key this digest was produced from
 * @param urls - the promoted image and thumbnail urls
 * @param collection - the job's target collection — the cache tag to clear once it matches
 */
const settleWriteback = (
    writeback: ImageWriteback,
    documentId: string,
    key: string,
    urls: DigestedImageUrls,
    collection: string
): Promise<void> =>
    writeback(documentId, key, urls).then((matched) => {
        if (!matched) {
            // Stale job or deleted document: nobody will ever read these urls, so they are
            // unlinked rather than left as orphans nothing can find again.
            logger.info({
                message: 'Image digest writeback matched no document; cleaning up promoted files.',
                collection,
                documentId,
                key
            });
            return imageStore.remove(urls.imageUrl).then(() => undefined);
        }

        return invalidateCacheTagsLogged([collection]);
    });

/**
 * Process a single image digest job from the queue.
 *
 * `false` for a malformed payload or an unregistered collection — both permanent, both
 * dead-lettered, same as a bad decode. Anything else thrown is left to reject, so
 * `consumeFromQueue` requeues it. `Partial<ImageDigestJobPayload>` because it came off a broker.
 */
export const handleImageDigestJob = (job: Partial<ImageDigestJobPayload>): Promise<boolean> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the payload crossed a queue: its type is a claim, not a fact
    if (!job?.collection || !job.documentId || !job.key) {
        logger.warn({ message: 'Invalid image digest job payload, discarding.', job });
        return Promise.resolve(false);
    }

    const { collection, documentId, key } = job;
    const writeback = resolveWriteback?.(collection);
    if (!writeback) {
        logger.warn({
            message: 'Image digest job names an unregistered collection, discarding.',
            collection
        });
        return Promise.resolve(false);
    }

    return digestQuarantinedImage(key)
        .then((urls) =>
            settleWriteback(writeback, documentId, key, urls, collection).then(() => true)
        )
        .catch((error: Error) => {
            // A bad decode is permanent — every redelivery decodes the same bytes the same way —
            // so it is dead-lettered rather than retried. `digestQuarantinedImage` throwing for any
            // OTHER reason (disk full, a storage write failing) looks identical from here; see
            // IMAGE_PIPELINE_PLAN.md's failure-mode table for why both still resolve `false` today,
            // and revisit if that distinction ever needs a second code path.
            logger.error({ message: 'Image digest worker failed.', error: error.message, key });
            return imageStore.removeQuarantined(key).then(() => false);
        });
};

/**
 * Queue-aware image digest dispatch — what a module's service calls right after persisting a
 * document with a `pendingImageKey`. Same shape as `enqueueEmail`: a reachable broker gets the
 * job published and this resolves immediately, leaving the record on its placeholder; no broker
 * (or a failed publish) runs the pipeline right here instead, covered by the caller's `await`.
 *
 * @param payload - the job envelope
 * @param writeback - the calling module's OWN writeback, supplied directly — the caller already
 *   knows which collection it is
 */
export const enqueueImageDigest = (
    payload: ImageDigestJobPayload,
    writeback: ImageWriteback
): Promise<void> => {
    const runInline = () =>
        digestQuarantinedImage(payload.key).then((urls) =>
            settleWriteback(writeback, payload.documentId, payload.key, urls, payload.collection)
        );

    if (!isQueueEnabled()) return runInline();

    return publishToQueue<ImageDigestJobPayload>({
        queue: IMAGE_QUEUE,
        payload
    }).then((published) => {
        if (published) {
            logger.debug({ message: 'Image digest job enqueued.', collection: payload.collection });
            return;
        }
        return runInline();
    });
};
