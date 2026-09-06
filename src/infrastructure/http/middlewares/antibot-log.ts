/**
 * @module
 * The one log line, and the one HTTP-refusal shape, every anti-automation rung uses. `rung`
 * distinguishes a rate-limit refusal from an email-policy or human-challenge one in the same log
 * stream, instead of three files each writing their own message format.
 */

import type { Request, Response } from 'express';
import { logger } from '@infrastructure/adapters/logger';
import { rejectResponse, type ResponseErrorItem } from '@infrastructure/http/response';

/** Which rung refused — matches the names `GET /antibot/config` publishes under `rungs`. */
export type AntibotRung = 'rate-limit' | 'email-policy' | 'human-challenge';

/**
 * Warn-logs a refusal in the one shared shape. Takes `method`/`path`/`status` rather than a full
 * `Request`/`Response` so rung 2's email-policy check — read from inside a service, not a
 * middleware — can call it too. `status` is whatever the caller actually answers: usually a
 * refusal (429, 401), but rung 2's own 201 ruse logs its true `status` here precisely because the
 * response lies about it.
 */
export const logAntibotRefusal = (
    rung: AntibotRung,
    method: string,
    path: string,
    status: number
): void => {
    logger.warn(`Antibot refused ${method} ${path}`, {
        rung,
        method,
        route: path,
        status_code: status
    });
};

/**
 * Logs, then answers through the shared error envelope — never express-rate-limit's own
 * plain-text body. Status/code/message stay the caller's choice: a 429 and a 401 mean genuinely
 * different things, and collapsing them into one shape would lose that.
 */
export const refuseAntibot = (
    rung: AntibotRung,
    request: Request,
    response: Response,
    status: number,
    errors: ResponseErrorItem[]
): Response => {
    logAntibotRefusal(rung, request.method, request.path, status);
    return rejectResponse(response, status, errors);
};
