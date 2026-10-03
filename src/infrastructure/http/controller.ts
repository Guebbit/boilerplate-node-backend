/**
 * @module
 * The four steps every controller repeats — read input, validate, call one service method, branch
 * on the envelope, catch — written once as helpers rather than a `defineController()` wrapper. A
 * wrapper would own the chain: it adds a stack frame pointing here instead of the handler, forces
 * the service result through a generic, and hides the `.catch()` call that
 * `controller-chain-must-catch` walks the AST looking for. Helpers keep all three visible.
 */

import type { Request, Response } from 'express';
import type { ZodError, ZodType } from 'zod';
import {
    rejectResponse,
    validationErrors,
    type ResponseSuccess,
    type ResponseReject
} from './response';
import { rejectDatabaseError } from './errors';
import { malformedIdIssues } from './ids';

/**
 * The operation name printed in a stack trace, an audit/log line and the generated
 * `docs/modules/` tables — one formula every controller factory under `infrastructure/surfaces/`
 * derives its handler's name from, rather than each concatenating `verb` + capitalized `entity`
 * by hand.
 *
 * @param verb - the operation's verb, already lower-case — `'get'`, `'delete'`
 * @param entity - the entity name, cased the way the module wants it in the name
 * @param suffix - appended after `entity`, for an operation that would otherwise collide with
 *   another on the same entity — `'Item'` distinguishes a read-one from a list's plain `getX`
 */
export const operationName = (verb: string, entity: string, suffix = ''): string =>
    `${verb}${entity.charAt(0).toUpperCase()}${entity.slice(1)}${suffix}`;

/**
 * Give an Express handler the name `operation`, in place of the generic name an anonymous
 * function carries — what every stack trace, the request log line and `docs/modules/` print.
 *
 * A computed property key is the one way to do this without `Object.defineProperty`: a function
 * LITERAL written at that key takes the key's name. A reference stored under the key keeps its
 * own name, so the handler is wrapped in a literal that forwards to it.
 *
 * @param operation - the name to give `handler`, from {@link operationName}
 * @param handler - the Express handler itself
 */
export const namedHandler = <THandler extends (request: Request, response: Response) => unknown>(
    operation: string,
    handler: THandler
): THandler =>
    // `as THandler`: the forwarder has the handler's own parameters and return, but the compiler
    // only sees the constraint, not the caller's narrower type.
    ({ [operation]: (request: Request, response: Response) => handler(request, response) })[
        operation
    ] as THandler;

/**
 * What a service hands back: either data with a status, or a status and the reasons — the exact
 * union `generateSuccess`/`generateReject` already produce, named here since a controller talks
 * about "the service result" more often than the envelope's own two halves. `./response` is a
 * sibling FILE, not a module — nothing stops importing it directly, unlike the reasoning that
 * applies to `@infrastructure` reaching into `@modules`.
 */
export type ServiceResult<TData> = ResponseSuccess<TData> | ResponseReject;

/**
 * Send the refusal if the service refused, and say whether it did.
 *
 * Covers the REFUSAL only: the success side is where controllers genuinely differ (a raw payload,
 * a transformed one, a 201, an audit event first), so only this half is common enough to share.
 *
 * The type predicate narrows `result` at the call site: after `if (refused(response, result))
 * return;`, TypeScript already knows the remaining `result` is a `ResponseSuccess<TData>` with its
 * `data` present, no cast needed.
 *
 * @param response - the express response
 * @param result - whatever the service returned
 * @returns `true` when a rejection has been sent and the caller must stop
 */
export const refused = <TData>(
    response: Response,
    result: ServiceResult<TData>
): result is ResponseReject => {
    if (result.success) return false;

    rejectResponse(response, result.status, result.errors);
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
    (error: unknown): void => {
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
 * Parse a request body (or a query) against its generated schema, answering 422 and returning
 * `undefined` when it does not match.
 *
 * An id field the schema declares (the contract's `Id`) that is not this backend's own id is
 * refused here too, in the same 422 and under the same `details.field`, so a bad id is one more
 * bad field and never a database error. The path-id half of that rule is `requireId`.
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
    const refusals = parseResult.success ? [] : validationErrors(parseResult.error);
    const flagged = new Set(refusals.map((item) => String(item.details?.field)));
    const malformedIds = malformedIdIssues(schema, body, flagged);

    if (parseResult.success && malformedIds.length === 0) return parseResult.data;

    rejectResponse(response, 422, [...refusals, ...malformedIds]);
    return undefined;
};
