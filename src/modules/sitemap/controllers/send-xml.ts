/**
 * @module
 * The one way every sitemap file leaves: streamed as XML with an hour of public caching.
 */

import { pipeline, Readable } from 'node:stream';
import type { Response } from 'express';
import type { SitemapIndexStream, SitemapStream } from 'sitemap';
import { logger } from '@infrastructure/adapters/logger';

/** How long a crawler or proxy may reuse a sitemap: it changes with the catalogue, not per request. */
const CACHE_CONTROL = 'public, max-age=3600';

/**
 * Pipes `entries` through an XML writer into the response.
 *
 * Node `pipeline`: backpressure, and every stream is destroyed when one fails or the client hangs
 * up. https://nodejs.org/api/stream.html#streampipelinesource-transforms-destination-callback
 *
 * @param response - the response to write
 * @param entries - what the file lists
 * @param writer - the XML stream for this file kind (`SitemapStream` or `SitemapIndexStream`)
 */
export const sendXml = (
    response: Response,
    entries: readonly (object | string)[],
    writer: SitemapStream | SitemapIndexStream
): void => {
    response.status(200).type('application/xml').setHeader('Cache-Control', CACHE_CONTROL);
    pipeline(Readable.from(entries), writer, response, (error) => {
        // Headers are out: nothing is left to tell the client, only to record it.
        if (error) logger.warn({ message: 'sitemap stream aborted', error });
    });
};
