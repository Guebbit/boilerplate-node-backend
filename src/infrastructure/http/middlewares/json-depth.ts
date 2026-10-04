/**
 * @module
 * The nesting guard for JSON bodies: a body nested deeper than {@link MAX_JSON_DEPTH} is a 400.
 *
 * Why:     `express.json`'s limit is a BYTE cap, so a 100 kB body of `[[[…]]]` is 50,000 levels
 *          deep and parses fine. The first recursive walk over it (the idempotency fingerprint, a
 *          cache key, a Zod schema) throws `RangeError`, and the caller gets a 500 they can repeat.
 * Why here: right after the parser, before any route. One guard closes every walker behind it.
 * Shape:   iterative, with an explicit stack. A recursive check would throw the same `RangeError`
 *          it exists to prevent.
 * Scope:   JSON only. urlencoded bodies are bounded by `qs`'s own depth limit, and multipart field
 *          names by multer's.
 *
 * See: docs/theory/defences/denial-of-service.md
 */

import type { NextFunction, Request, Response } from 'express';
import { rejectResponse } from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';
import { ERROR_CODES } from '@api/error-codes';

/** The deepest nesting a request body may have. A real payload is a handful of levels deep. */
export const MAX_JSON_DEPTH = 32;

/** The media types `express.json` parses, in `app/security.ts` — this guard reads those only. */
const JSON_TYPES = ['application/json', 'application/merge-patch+json'];

/**
 * Whether `root` nests objects or arrays deeper than `limit`. The root container is depth 1.
 *
 * Iterative: one stack of containers still to visit, each with the depth it sits at.
 *
 * @param root - a parsed JSON value
 * @param limit - the deepest allowed container depth
 */
export const exceedsDepth = (root: unknown, limit: number): boolean => {
    const pending: { value: unknown; depth: number }[] = [{ value: root, depth: 1 }];

    for (let item = pending.pop(); item; item = pending.pop()) {
        const { value, depth } = item;
        if (typeof value !== 'object' || value === null) continue;
        if (depth > limit) return true;
        for (const child of Array.isArray(value) ? value : Object.values(value))
            pending.push({ value: child, depth: depth + 1 });
    }

    return false;
};

/**
 * Express middleware: refuse a parsed JSON body nested past {@link MAX_JSON_DEPTH}.
 *
 * @param request - the incoming request, its body already parsed
 * @param response - answered with 400 `BAD_REQUEST` when the body is too deep
 * @param next - called for every other request
 */
export const limitJsonDepth = (request: Request, response: Response, next: NextFunction) => {
    // `request.is`: false when there is no body or it is another media type. Nothing to walk then.
    if (request.is(JSON_TYPES) && exceedsDepth(request.body, MAX_JSON_DEPTH))
        return rejectResponse(response, 400, [
            {
                code: ERROR_CODES.BAD_REQUEST,
                message: t('generic.error-bad-request'),
                details: { reason: 'body-too-deep', maxDepth: MAX_JSON_DEPTH }
            }
        ]);

    next();
};
