/**
 * @module
 * Turns a quarantined upload into its promoted original plus thumbnail, then writes the result
 * back onto the waiting document. `digestQuarantinedImage` is the one pipeline; the queued worker
 * (`handleImageDigestJob`) and the no-broker inline path (`enqueueImageDigest`) both share it.
 * Since this file sits below `@kernel`/`@modules` and cannot import either, the writeback is an
 * inverted port — {@link ImageWriteback} plus a registration function — supplied at boot by
 * `app/workers.ts`.
 *
 * See: docs/tools/image-processing.md
 */

import { createHash } from 'node:crypto';
import type { ImageDigestJobPayload } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import { imageStore } from '@infrastructure/adapters/image-store';
import { digestImage, thumbnailImage } from '@infrastructure/adapters/image';
import type { ReencodableImageMime } from '@infrastructure/adapters/image';
import { identifyImage } from '@infrastructure/adapters/image-signatures';
import { IMAGE_QUEUE, publishToQueue } from '@infrastructure/adapters/queue';
import { invalidateCacheTagsLogged } from '@infrastructure/adapters/cache';

/* Queue name for image digest jobs — owned by the adapter, re-exported for the worker registry. */
export { IMAGE_QUEUE } from '@infrastructure/adapters/queue';

/** The only formats `digestImage` can re-encode — see `ReencodableImageMime`. */
const REENCODABLE_MIMES: ReadonlySet<string> = new Set<ReencodableImageMime>([
    'image/png',
    'image/jpeg',
    'image/webp'
]);

/** Narrows a declared mime to {@link ReencodableImageMime}, `undefined` included as "no". */
const isReencodableMime = (mime: string | undefined): mime is ReencodableImageMime =>
    mime !== undefined && REENCODABLE_MIMES.has(mime);

/**
 * The one PERMANENT failure {@link digestQuarantinedImage} can throw — bytes that will never
 * decode as one of the three accepted formats decode the same way on every redelivery. Every
 * OTHER rejection (a storage write failing, disk full, the writeback's own DB call) is presumed
 * TRANSIENT and left as a plain throw, so {@link handleImageDigestJob} can tell the two apart and
 * `consumeFromQueue` retries the second kind instead of discarding it.
 */
export class UnsupportedImageFormatError extends Error {}

/**
 * The shared identity a digest run's promoted original AND its thumbnail are filed under —
 * derived from the RE-ENCODED original's own bytes, SALTED by `owner`. See
 * `image-store.ts#promote`'s docblock for why: it is what makes a duplicate run of the same input
 * converge instead of collide, and a stale run's cleanup provably unable to delete a DIFFERENT
 * owner's live file.
 *
 * Content-addressing alone is not enough: two documents that upload byte-identical images would
 * land on the SAME file without `owner` salting it, so cleaning up one document's stale run — a
 * writeback that matches nothing, because a newer upload has already superseded it — could delete
 * a file a completely unrelated document is still serving. `owner` closes that: it is the target
 * document's id on the path that has one ({@link handleImageDigestJob}, {@link enqueueImageDigest}
 * — retries of that SAME document still converge on the same file, which is the idempotency this
 * was for), or the quarantine key itself on the one path with no document to salt by yet
 * (`http/middlewares/upload.ts`'s synchronous, no-broker digest, ahead of the write that mints
 * one) — that path never retries the same key twice, so nothing is lost by making every upload
 * there unique instead.
 *
 * @param owner - what makes this run's file NOT shared with an unrelated one — see above
 * @param digested - the re-encoded bytes the file is a hash of
 */
const contentStem = (owner: string, digested: Buffer): string =>
    `${owner}-${createHash('sha256').update(digested).digest('hex').slice(0, 24)}`;

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
 * @param owner - salts the promoted stem — see {@link contentStem}. Pass the target document's
 *   id where one already exists; `key` itself where it does not yet (`upload.ts`'s pre-write
 *   inline call)
 * @throws {@link UnsupportedImageFormatError} when the bytes will never decode as one of the
 *   three accepted formats (the caller dead-letters/discards); anything else (a storage failure)
 *   as a plain `Error` (the caller retries).
 */
export const digestQuarantinedImage = (key: string, owner: string): Promise<DigestedImageUrls> =>
    imageStore.readQuarantined(key).then((raw) => {
        const mime = identifyImage(raw);
        if (!isReencodableMime(mime))
            throw new UnsupportedImageFormatError(
                `Quarantined image ${key} does not match an accepted format.`
            );

        return Promise.all([digestImage(raw, mime), thumbnailImage(raw)])
            .then(([digested, thumbnail]) => {
                const stem = contentStem(owner, digested);
                return Promise.all([
                    imageStore.promote(stem, digested, mime),
                    imageStore.putDerivative(stem, thumbnail)
                ]);
            })
            .then(([imageUrl, thumbnailUrl]) =>
                // Best-effort: the promoted files are what matters, and a leftover quarantine file
                // is cleaned up later by `scripts/ops/reap-quarantine.ts` regardless.
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
            // Stryker disable all
            logger.info({
                message: 'Image digest writeback matched no document; cleaning up promoted files.',
                collection,
                documentId,
                key
            });
            // Stryker restore all
            return imageStore.remove(urls.imageUrl).then(() => undefined);
        }

        return invalidateCacheTagsLogged([collection]);
    });

/**
 * Process a single image digest job from the queue.
 *
 * `false` for a malformed payload, an unregistered collection, or an {@link
 * UnsupportedImageFormatError} — all permanent, all dead-lettered (the quarantine file removed
 * with the last of the three, since nothing will ever read it again). Any OTHER throw — a
 * storage write failing, disk full — is rethrown as-is, so `consumeFromQueue` nacks and retries
 * it, WITHOUT touching the quarantine file the retry still needs to read.
 * `Partial<ImageDigestJobPayload>` because it came off a broker.
 */
export const handleImageDigestJob = (job: Partial<ImageDigestJobPayload>): Promise<boolean> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the payload crossed a queue: its type is a claim, not a fact
    if (!job?.collection || !job.documentId || !job.key) {
        // Stryker disable next-line all
        logger.warn({ message: 'Invalid image digest job payload, discarding.', job });
        return Promise.resolve(false);
    }

    const { collection, documentId, key } = job;
    const writeback = resolveWriteback?.(collection);
    if (!writeback) {
        // Stryker disable all
        logger.warn({
            message: 'Image digest job names an unregistered collection, discarding.',
            collection
        });
        // Stryker restore all
        return Promise.resolve(false);
    }

    return digestQuarantinedImage(key, documentId)
        .then((urls) =>
            settleWriteback(writeback, documentId, key, urls, collection).then(() => true)
        )
        .catch((error: unknown) => {
            if (error instanceof UnsupportedImageFormatError) {
                // Permanent — every redelivery decodes the same bytes the same way — so the
                // quarantine file is removed along with dead-lettering the job.
                // Stryker disable next-line all
                logger.warn({ message: 'Image digest worker: unsupported format.', error, key });
                return imageStore.removeQuarantined(key).then(() => false);
            }

            // Presumed TRANSIENT (disk full, a storage write failing, the writeback's own DB
            // call) — rethrown so `consumeFromQueue` nacks and retries, and the quarantine file
            // stays put for that retry to read.
            // Stryker disable next-line all
            logger.error({ message: 'Image digest worker failed.', error, key });
            throw error;
        });
};

/**
 * Queue-aware image digest dispatch — what a module's service calls right after persisting a
 * document with a `pendingImageKey`. `pendingImageKey` is only ever set while the queue looked
 * ready (see `quarantineUploadedImages`), so the common case here is a reachable broker: the job
 * gets published and this resolves immediately, leaving the record on its placeholder. A publish
 * that still fails — the broker died between that check and this call — degrades to running the
 * pipeline right here instead, always covered by the caller's `await`: this is the one path where
 * "resolved" and "digested" can otherwise disagree.
 *
 * @param payload - the job envelope
 * @param writeback - the calling module's OWN writeback, supplied directly — the caller already
 *   knows which collection it is
 * @returns the digested urls when this call ran the pipeline inline, so the caller can copy them
 *   onto the in-memory document it hands back; `undefined` when the job was queued instead, since
 *   the database still holds the placeholder and nothing here has changed
 */
export const enqueueImageDigest = (
    payload: ImageDigestJobPayload,
    writeback: ImageWriteback
): Promise<DigestedImageUrls | undefined> => {
    const runInline = (): Promise<DigestedImageUrls> =>
        digestQuarantinedImage(payload.key, payload.documentId).then((urls) =>
            settleWriteback(
                writeback,
                payload.documentId,
                payload.key,
                urls,
                payload.collection
            ).then(() => urls)
        );

    // No `isQueueEnabled()` pre-check: `publishToQueue` already resolves `false` with no I/O when
    // the broker is unconfigured, which the `!published` branch below runs inline exactly as a
    // configured-but-unreachable broker would — one fallback covers both.
    return publishToQueue<ImageDigestJobPayload>({
        queue: IMAGE_QUEUE,
        payload
    }).then((published) => {
        if (published) {
            // Stryker disable next-line all
            logger.debug({ message: 'Image digest job enqueued.', collection: payload.collection });
            return undefined;
        }
        return runInline();
    });
};

/**
 * A module's own `enqueueIfPending`, factored out since `users` and `products` were identical
 * apart from the collection name and writeback. Checks the just-persisted document for a
 * `pendingImageKey`, dispatches through {@link enqueueImageDigest} when there is one, and always
 * hands back the same document — awaited, so a caller that returned first can't answer with a
 * record the inline fallback hasn't finished writing yet.
 *
 * When that fallback ran, the database already holds the real urls (`writeback` wrote them) — so
 * this copies them onto the in-memory document too and clears `pendingImageKey`, or a caller that
 * hands this same object back out in its response would keep serving the pre-digest placeholder
 * with no `pendingImageKey` left to tell the client to refetch.
 *
 * @param document - the just-persisted document, checked for `pendingImageKey`
 * @param collection - the job's `collection` field, matched by {@link registerImageWritebackResolver}
 * @param writeback - the calling module's own writeback
 */
export const enqueueIfImagePending = <
    T extends {
        _id: unknown;
        pendingImageKey?: string;
        imageUrl?: string;
        thumbnailUrl?: string;
    }
>(
    document: T,
    collection: string,
    writeback: ImageWriteback
): Promise<T> =>
    document.pendingImageKey
        ? enqueueImageDigest(
              { collection, documentId: String(document._id), key: document.pendingImageKey },
              writeback
          ).then((urls) => {
              if (urls) {
                  document.imageUrl = urls.imageUrl;
                  document.thumbnailUrl = urls.thumbnailUrl;
                  document.pendingImageKey = undefined;
              }
              return document;
          })
        : Promise.resolve(document);
