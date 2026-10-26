/**
 * @module
 * Staff preview of a draft language's product text.
 *
 * Trigger:  the caller's FIRST `Accept-Language` choice is a switched-off language, and the
 *           caller may read drafts (`display:Locale`, asked through the translation port).
 * Effect:   the request is re-bound to that language, so the product reads resolve its text over
 *           the normal live chain, field by field. The answer is `private, no-store`.
 * Others:   anyone else keeps the live pick `locale.ts` already made, never an error.
 *
 * Mounted per router AFTER `getAuth` (it needs `request.caller`) and BEFORE `setCache` (its key
 * is built from `request.locale`). See docs/modules/locales.md#previewing-a-draft
 */

import type { NextFunction, Request, Response } from 'express';
import { markDraftPreview } from '@infrastructure/http/middlewares/cache';
import { createPreviewContext, draftLocaleFor, runWithLocaleContext } from '@infrastructure/i18n';
import { canPreviewDraftLanguages } from '../translation';

/**
 * Re-binds the request to a draft language when a staff caller asked for it first.
 *
 * `acceptsLanguages()` with no argument lists the header's ranges best first (Express, via
 * `accepts`): a draft at `q=0.5` behind a live language is not a request for the draft.
 * https://expressjs.com/en/api.html#req.acceptsLanguages
 */
export const previewDraftLanguage = (
    request: Request,
    response: Response,
    next: NextFunction
): void => {
    const draft = draftLocaleFor(request.acceptsLanguages().at(0) ?? '');
    if (!draft || request.locale === draft || !canPreviewDraftLanguages(request.caller)) {
        next();
        return;
    }

    const context = createPreviewContext(draft);
    request.locale = context.locale;
    request.t = context.t;
    response.set('Content-Language', draft);
    markDraftPreview(request, response);

    runWithLocaleContext(context, next);
};
