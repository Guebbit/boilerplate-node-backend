/**
 * @module
 * `GET /sitemap/products-{page}.xml` — one run of the public catalogue.
 */

import type { Request, Response } from 'express';
import { SitemapStream } from 'sitemap';
import { catchAs } from '@infrastructure/http/controller';
import { rejectResponse } from '@infrastructure/http/response';
import { sitemapService } from '../service';
import { sendXml } from './send-xml';

/** A file number as the index writes it: a positive whole number, no sign or padding. */
const PAGE_NUMBER = /^[1-9]\d*$/;

/** GET /sitemap/products-:page.xml — a file the index lists; any other name is a 404. */
export const getSitemapProducts = (request: Request<{ page: string }>, response: Response) => {
    if (!PAGE_NUMBER.test(request.params.page)) {
        rejectResponse(response, 404);
        return;
    }

    return sitemapService
        .listProducts(Number(request.params.page))
        .then((entries) => {
            if (!entries) {
                rejectResponse(response, 404);
                return;
            }
            sendXml(response, entries, new SitemapStream());
        })
        .catch(catchAs(response, 'getSitemapProducts'));
};
