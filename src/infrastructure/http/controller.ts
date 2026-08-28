/**
 * The four steps every controller repeats, written once.
 *
 * A controller in this codebase reads input, validates it, calls one service method, branches on
 * the envelope that comes back, and catches. Four of those five steps are identical in every file
 * — which is why the same five-step shape was re-typed across 72 controllers, and why changing how
 * a service result maps to a status was a 63-site edit.
 *
 * Helpers rather than a `defineController()` wrapper, deliberately. A wrapper owns the chain: the
 * stack trace gains a frame that points here instead of at the handler, the service result has to
 * be threaded through a generic or inference degrades to `unknown`, and
 * `eslint/rules/controller-chain-must-catch.ts` — which walks the AST for a chain ending in a real
 * `.catch()` call — stops seeing the catch it exists to find. Each of these is a call the
 * controller still makes for itself, so the chain, the types and the guard all survive.
 *
 * `locales/controllers/write-locale-entries.ts` invented the 422 half locally first; this is that
 * idea, finished and shared.
 */

import type { Response } from 'express';
import type { ZodError, ZodType } from 'zod';
import type { CastError } from 'mongoose';
import { rejectResponse, validationErrors, type ResponseErrorItem } from './response';
import { rejectDatabaseError } from './errors';

/**
 * What a service hands back: either data with a status, or a status and the reasons.
 *
 * Structural rather than importing the service's own union, because `@infrastructure` may not
 * reach into a module — and because every service already produces exactly this shape through
 * `generateSuccess` / `generateReject`.
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
 * `if (refused(response, result)) return;` — four lines of identical branch in 39 controllers,
 * written once. It covers the REFUSAL only, deliberately: the success side is where controllers
 * genuinely differ (a raw payload, a transformed one, a 201, an audit event first), and a helper
 * that owned the send too would need a callback to hand most of that back.
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
 * `catchAs(response, 'getProducts')` reads as the name of the operation whose failure is being
 * logged, which is the argument `rejectDatabaseError` wanted anyway. The literal `.catch(` stays
 * at the call site, so `controller-chain-must-catch` still sees it.
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
 * Same contract as {@link extractAndValidateId} in `./request`: it RESPONDS as well as extracts, so
 * the caller must bail out on `undefined` without touching the response again —
 * `const body = parseBody(...); if (!body) return;`
 *
 * Returning the parsed data rather than taking over the chain is what preserves the narrowing
 * controllers rely on: `parseResult.data` is typed by the schema, and several controllers
 * destructure it immediately.
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
