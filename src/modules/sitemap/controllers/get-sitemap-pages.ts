/**
 * @module
 * `GET /sitemap/pages.xml` — the shop's static pages.
 */

import type { Request, Response } from 'express';
import { SitemapStream } from 'sitemap';
import { catchAs } from '@infrastructure/http/controller';
import { sitemapService } from '../service';
import { sendXml } from './send-xml';

/** GET /sitemap/pages.xml — each static page, once per language. */
export const getSitemapPages = (_request: Request, response: Response) =>
    sitemapService
        .listPages()
        .then((entries) => {
            sendXml(response, entries, new SitemapStream());
        })
        .catch(catchAs(response, 'getSitemapPages'));
