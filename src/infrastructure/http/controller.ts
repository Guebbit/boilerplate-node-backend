/**
 * @module
 * The four steps every controller repeats — read input, validate, call one service method, branch
 * on the envelope, catch — written once as helpers rather than a `defineController()` wrapper. A
 * wrapper would own the chain: it adds a stack frame pointing here instead of the handler, forces
 * the service result through a generic, and hides the `.catch()` call that
 * `controller-chain-must-catch` walks the AST looking for. Helpers keep all three visible.
 */

import type { Response } from 'express';
import type { ZodError, ZodType } from 'zod';
import type { CastError } from 'mongoose';
import { rejectResponse, validationErrors, type ResponseErrorItem } from './response';
import { rejectDatabaseError } from './errors';

/**
 * What a service hands back: either data with a status, or a status and the reasons.
 *
 * Structural, not the service's own union — `@infrastructure` cannot reach into a module, and
 * every service already produces this shape via `generateSuccess` / `generateReject`.
 */
interface ServiceResult<TData> {
    success: boolean;
    status: number;
    message?: string;
    data?: TData;
    errors?: ResponseErrorItem[];
}

/**
 * Send the refusal if the service refused, and say whether it did.
 *
 * Covers the REFUSAL only: the success side is where controllers genuinely differ (a raw payload,
 * a transformed one, a 201, an audit event first), so only this half is common enough to share.
 *
 * @param response - the express response
 * @param result - whatever the service returned
 * @returns `true` when a rejection has been sent and the caller must stop
 */
export const refused = <TData>(response: Response, result: ServiceResult<TData>): boolean => {
    if (result.success) return false;

    rejectResponse(response, result.status, result.errors ?? []);
    return true;
};

/**
 * The `.catch` every controller ends with, as a callback.
 *
 * The literal `.catch(` stays at the call site, so `controller-chain-must-catch` still sees it.
 *
 * @param response - the express response
 * @param context - developer-facing operation name, recorded in the log line
 */
export const catchAs =
    (response: Response, context: string) =>
    (error: CastError | Error): void => {
        rejectDatabaseError(response, context, error);
    };

/**
 * Answer 422 for a Zod failure.
 *
 * @param response - the express response
 * @param error - the `ZodError` from a failed `safeParse`
 */
export const rejectValidation = (response: Response, error: ZodError) =>
    rejectResponse(response, 422, validationErrors(error));

/**
 * Parse a request body against its generated schema, answering 422 and returning `undefined` when
 * it does not match.
 *
 * RESPONDS as well as extracts — the caller must bail out on `undefined` without touching the
 * response again: `const body = parseBody(...); if (!body) return;`
 *
 * @param schema - the generated Zod schema for this operation's body
 * @param body - `request.body`
 * @param response - the express response, used only on failure
 * @returns the parsed body, or `undefined` when 422 has already been sent
 */
export const parseBody = <TSchema extends ZodType>(
    schema: TSchema,
    body: unknown,
    response: Response
): TSchema['_output'] | undefined => {
    const parseResult = schema.safeParse(body);
    if (parseResult.success) return parseResult.data;

    rejectValidation(response, parseResult.error);
    return undefined;
};
