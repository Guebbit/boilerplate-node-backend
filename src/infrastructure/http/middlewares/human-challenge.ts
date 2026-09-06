/**
 * @module
 * The gate `signup`, `reset` and `contact` mount when a human-challenge provider is selected: the
 * caller must carry a token the provider vouches for. With the default `none` provider the gate
 * costs one registry lookup and calls `next()` — no header parsing, no network. See
 * `infrastructure/adapters/antibot-providers` for the port itself.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { rejectResponse } from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import {
    isHumanChallengeEnabled,
    resolveHumanChallengeProvider
} from '@infrastructure/adapters/antibot-providers';

/** The header a provider token travels in — a header, so one gate fits any request shape. */
const TOKEN_HEADER = 'x-antibot-challenge-token';

/**
 * Answer the shared error envelope and say so in the log, since nothing downstream will — the
 * same reasoning `rate-limit.ts` refuses under.
 */
const refuse = (request: Request, response: Response, provider: string): void => {
    logger.warn(`Antibot refused ${request.method} ${request.path}`, { provider });
    rejectResponse(response, 401, [
        {
            code: 'ANTIBOT_VERIFICATION_FAILED',
            message: t('generic.error-antibot-verification-failed')
        }
    ]);
};

/**
 * Reads `x-antibot-challenge-token`, asks the active provider about it, and either calls `next()`
 * or refuses. A missing header is a refusal: a caller with no token has solved no challenge,
 * which is exactly what a stripped-down script looks like.
 */
export const humanChallengeGate: RequestHandler = (
    request: Request,
    response: Response,
    next: NextFunction
) => {
    if (!isHumanChallengeEnabled()) {
        next();
        return;
    }

    const provider = resolveHumanChallengeProvider();
    const token = request.header(TOKEN_HEADER);
    if (!token) {
        refuse(request, response, provider.name);
        return;
    }

    provider
        .verify(token, request.ip)
        .then((verdict) => {
            if (verdict === 'human') {
                next();
                return;
            }
            refuse(request, response, provider.name);
        })
        // A provider that throws rather than answering is a refusal, never a pass.
        .catch(() => refuse(request, response, provider.name));
};
