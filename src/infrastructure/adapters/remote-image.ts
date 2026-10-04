/**
 * @module
 * Re-hosting a remote picture: download it once, push it through the same digest pipeline an
 * upload takes, and hand back the two local urls to persist. No third-party url is ever stored,
 * so no viewer's IP is sent to another host on every render.
 *
 * Best-effort by design: any failure resolves to `undefined` — a missing avatar must never fail
 * the signup that asked for it.
 *
 * See: docs/tools/image-processing.md
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import path from 'node:path';
import { deleteFile } from '@infrastructure/adapters/filesystem';
import {
    digestQuarantinedImage,
    type DigestedImageUrls
} from '@infrastructure/adapters/image.worker';
import { imageStore } from '@infrastructure/adapters/image-store';
import { logger } from '@infrastructure/adapters/logger';
import { resolveSafeOutboundTarget } from '@infrastructure/adapters/ssrf-guard';
import { uploadStagingPath } from '@infrastructure/http/middlewares/upload';

/** Total budget for resolving, connecting and downloading — one signal covers all of it. */
const DOWNLOAD_TIMEOUT_MS = 5000;

/** Hard cap on the downloaded bytes, the same as an upload's own default. */
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Collect a response body, refusing anything over {@link MAX_DOWNLOAD_BYTES}.
 *
 * @param response - the response to read; destroyed the moment the cap is crossed
 */
const readCapped = (response: IncomingMessage): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let received = 0;
        response.on('data', (chunk: Buffer) => {
            received += chunk.length;
            if (received > MAX_DOWNLOAD_BYTES) {
                response.destroy(new Error('Remote image exceeds the size cap.'));
                return;
            }
            chunks.push(chunk);
        });
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
    });

/**
 * GET a url through the SSRF guard: https only, DNS pinned to the validated address, and no
 * redirect followed (a 3xx is a failure, not a location to chase).
 * https://nodejs.org/api/https.html#httpsrequestoptions-callback
 *
 * @param rawUrl - the provider-supplied avatar url
 * @throws when the guard refuses it, the status is not 200, or the body is too large
 */
const download = (rawUrl: string): Promise<Buffer> => {
    const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
    return resolveSafeOutboundTarget(rawUrl, signal).then(
        (target) =>
            new Promise<Buffer>((resolve, reject) => {
                const url = new URL(rawUrl);
                const outgoing = httpsRequest(
                    {
                        // The original host, not the pinned IP: TLS must verify the name.
                        hostname: target.hostname,
                        port: url.port ? Number(url.port) : 443,
                        path: `${url.pathname}${url.search}`,
                        method: 'GET',
                        lookup: target.lookup,
                        signal
                    },
                    (response) => {
                        if (response.statusCode !== 200) {
                            response.resume();
                            reject(new Error(`Remote image answered ${response.statusCode}.`));
                            return;
                        }
                        readCapped(response).then(resolve, reject);
                    }
                );
                outgoing.on('error', reject);
                outgoing.end();
            })
    );
};

/**
 * Stage downloaded bytes and run them through quarantine and the digest pipeline.
 *
 * @param bytes - the downloaded image
 */
const digestBytes = (bytes: Buffer): Promise<DigestedImageUrls> => {
    const staging = uploadStagingPath();
    const stagedPath = path.join(staging, `${randomUUID()}.img`);
    return mkdir(staging, { recursive: true })
        .then(() => writeFile(stagedPath, bytes))
        .then(() => imageStore.quarantine(stagedPath))
        .then((key) =>
            // The owner salt is the key's stem, the same as the inline upload digest.
            digestQuarantinedImage(key, path.basename(key, path.extname(key))).finally(() =>
                imageStore.removeQuarantined(key)
            )
        )
        .catch((error: unknown) =>
            deleteFile(stagedPath).then((): never => {
                throw error;
            })
        );
};

/**
 * Download a remote picture and store it locally.
 *
 * @param remoteUrl - the picture's url, or nothing
 * @returns the local image and thumbnail urls, or `undefined` when there was nothing to fetch or
 *   the fetch failed for any reason — the caller carries on without an image
 */
export const rehostRemoteImage = (
    remoteUrl: string | undefined
): Promise<DigestedImageUrls | undefined> => {
    if (!remoteUrl) return Promise.resolve(undefined);
    return download(remoteUrl)
        .then(digestBytes)
        .catch((error: unknown) => {
            logger.warn({
                message: 'Could not re-host a remote image; continuing without.',
                error
            });
            return undefined;
        });
};
