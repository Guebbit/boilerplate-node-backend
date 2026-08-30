/**
 * @module
 * Turns a quarantined upload into its promoted original plus thumbnail, and writes the result
 * back onto the document that is waiting for it.
 *
 * `digestQuarantinedImage` is the one pipeline; two callers share it. `handleImageDigestJob` wraps
 * it for `consumeFromQueue` when a broker is configured — the normal path. `enqueueImageDigest` is
 * what a module's service calls right after creating or updating a document with a
 * `pendingImageKey`: it publishes a job when a broker is reachable, and runs the same pipeline
 * inline, in the request, when one is not (mirroring `enqueueEmail` in `adapters/mailer.ts`).
 *
 * This file lives in `infrastructure`, the bottom of the dependency graph, and may not import
 * `@kernel/*` or `@modules/*` — but `handleImageDigestJob` still has to turn a job's `collection`
 * string into a specific module's writeback, and only the app tier knows every module. The port
 * is inverted, same shape as `AuditSink` in `observability/audit.ts`: this file declares
 * {@link ImageWriteback} and a registration function, and `app/workers.ts` supplies the resolver
 * at boot, built from `resolveImageTargets(enabledModules)` in `kernel/registry.ts`.
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
    imageUrl: string;
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
                // is cleaned up later by `scripts/reap-quarantine.ts` regardless.
                imageStore.removeQuarantined(key).then(() => ({ imageUrl, thumbnailUrl }))
            );
    });

/**
 * Call a module's writeback, and clean up after it when it matches nothing.
 *
 * Shared by {@link handleImageDigestJob} and {@link enqueueImageDigest}'s inline fallback, so a
 * stale job or a document deleted mid-flight is handled identically on both paths — a gap here
 * previously existed only on the inline one, since nothing else exercised it.
 *
 * @param writeback - the module's own writeback
 * @param documentId - the target document's id
 * @param key - the quarantine key this digest was produced from
 * @param urls - the promoted image and thumbnail urls
 * @param logContext - fields to attach to the cleanup log line (e.g. `collection`)
 */
const settleWriteback = (
    writeback: ImageWriteback,
    documentId: string,
    key: string,
    urls: DigestedImageUrls,
    logContext: Record<string, unknown>
): Promise<void> =>
    writeback(documentId, key, urls).then((matched) => {
        if (matched) return;

        // Stale job or deleted document: nobody will ever read these urls, so they are unlinked
        // rather than left as orphans nothing can find again.
        logger.info({
            message: 'Image digest writeback matched no document; cleaning up promoted files.',
            ...logContext,
            documentId,
            key
        });
        return imageStore.remove(urls.imageUrl).then(() => undefined);
    });

/**
 * Process a single image digest job from the queue.
 *
 * `false` for a malformed payload or an unregistered collection — both permanent, both
 * dead-lettered. A bad decode dead-letters too (see the catch below); anything else thrown is
 * left to reject, so `consumeFromQueue` requeues it.
 *
 * Typed parameter, `Partial` because it came off a broker — see `handleEmailJob` for the reasoning.
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
            settleWriteback(writeback, documentId, key, urls, { collection }).then(() => true)
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
 * document with a `pendingImageKey`.
 *
 * Same shape as `enqueueEmail`: when a broker is reachable the job is published and this resolves
 * immediately, leaving the record on its placeholder until the worker catches up; when one is not
 * configured, or the publish itself fails, the pipeline runs right here instead, and the caller's
 * `await` covers it.
 *
 * @param payload - the job envelope
 * @param writeback - the calling module's OWN writeback, supplied directly rather than looked up —
 *   the caller already knows which collection it is
 */
export const enqueueImageDigest = (
    payload: ImageDigestJobPayload,
    writeback: ImageWriteback
): Promise<void> => {
    const runInline = () =>
        digestQuarantinedImage(payload.key).then((urls) =>
            settleWriteback(writeback, payload.documentId, payload.key, urls, {
                collection: payload.collection
            })
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
