/**
 * @module
 * `GET /sitemap/index.xml` — the file robots.txt names: it lists the others.
 */

import type { Request, Response } from 'express';
import { SitemapIndexStream } from 'sitemap';
import { catchAs } from '@infrastructure/http/controller';
import { sitemapService } from '../service';
import { sendXml } from './send-xml';

/** GET /sitemap/index.xml — the shop pages file and one file per run of products. */
export const getSitemapIndex = (_request: Request, response: Response) =>
    sitemapService
        .listFiles()
        .then((files) => {
            sendXml(response, files, new SitemapIndexStream());
        })
        .catch(catchAs(response, 'getSitemapIndex'));
