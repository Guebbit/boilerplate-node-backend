/**
 * @module
 * The gate `signup`, `reset` and `contact` mount when a human-challenge provider is selected: the
 * caller must carry a token the provider vouches for. With the default `none` provider the gate
 * costs one registry lookup and calls `next()` — no header parsing, no network. See
 * `infrastructure/adapters/antibot-providers` for the port itself.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { refuseAntibot } from '@infrastructure/http/middlewares/antibot-log';
import {
    isHumanChallengeEnabled,
    resolveHumanChallengeProvider
} from '@infrastructure/adapters/antibot-providers';

/** The header a provider token travels in — a header, so one gate fits any request shape. */
const TOKEN_HEADER = 'x-antibot-challenge-token';

/** Answers the shared error envelope and logs it — see `antibot-log.ts`. */
const refuse = (request: Request, response: Response): void => {
    refuseAntibot('human-challenge', request, response, 401, [
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
        refuse(request, response);
        return;
    }

    provider
        .verify(token, request.ip)
        .then((verdict) => {
            if (verdict === 'ok') {
                next();
                return;
            }
            refuse(request, response);
        })
        // A provider that throws rather than answering is a refusal, never a pass.
        .catch(() => refuse(request, response));
};
