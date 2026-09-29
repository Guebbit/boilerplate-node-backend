/**
 * @module
 * The 415 guard: a write body in a media type the operation does not declare is refused.
 *
 * Why it exists: `express.json` only parses the types it is told to. Any other body arrives as
 * `{}`, and an all-optional PATCH schema accepts `{}` — a 200 that changed nothing.
 * RFC 9110 §15.5.16 names the honest answer.
 *
 * See: docs/api/write-methods.md#patch--json-merge-patch
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { rejectResponse } from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';
import { ERROR_CODES } from '@api/error-codes';

/** One operation's row in the table the guard is built from. */
interface DeclaredOperation {
    /** Upper-case HTTP method. */
    method: string;
    /** Matches the request path of this operation's contract path template. */
    pattern: RegExp;
    /** How many `{param}` segments the template has — fewer means more specific. */
    parameterCount: number;
    /** The media types the contract declares for this operation's body. */
    types: readonly string[];
}

/**
 * Compiles a contract path template into a matcher.
 *
 * @param template - a contract path such as `/products/{id}/restore`
 * @returns the matcher, and how many parameters the template has
 */
const compileTemplate = (template: string): { pattern: RegExp; parameterCount: number } => {
    const segments = template.split('/');
    const source = segments
        .map((segment) =>
            segment.startsWith('{')
                ? '[^/]+'
                : segment.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)
        )
        .join('/');
    return {
        pattern: new RegExp(`^${source}$`),
        parameterCount: segments.filter((segment) => segment.startsWith('{')).length
    };
};

/**
 * Whether the request sends bytes. type-is's own check counts `Content-Length: 0` as a body,
 * which would 415 every action POST a client sends with a content type and nothing in it.
 *
 * @param request - the incoming request
 * @returns `true` for a chunked body or a non-zero `Content-Length`
 */
const carriesBody = (request: Request): boolean =>
    request.headers['transfer-encoding'] !== undefined ||
    Number(request.headers['content-length'] ?? 0) > 0;

/**
 * Builds the guard from a `METHOD /path/{param}` → media types table.
 *
 * Only a request that carries a body is judged: an action POST with no body has nothing to
 * misinterpret, and a missing required body is the schema's own 422. A route the table does not
 * know is left alone.
 *
 * @param table - the operations that declare a request body, keyed `METHOD /path/{param}`
 * @returns express middleware answering 415 for an undeclared type
 */
export const requireDeclaredContentType = (
    table: Readonly<Record<string, readonly string[]>>
): RequestHandler => {
    const operations: DeclaredOperation[] = Object.entries(table)
        .map(([key, types]) => {
            const [method = '', template = ''] = key.split(' ');
            return { method, ...compileTemplate(template), types };
        })
        // Static segments before parameters, so `/products/search` never reads as `/products/{id}`.
        .toSorted((left, right) => left.parameterCount - right.parameterCount);

    return (request: Request, response: Response, next: NextFunction) => {
        const path = request.path.length > 1 ? request.path.replace(/\/$/, '') : request.path;
        const operation = operations.find(
            (candidate) => candidate.method === request.method && candidate.pattern.test(path)
        );

        // `request.is` (type-is): `false` when the type is not listed.
        if (operation && carriesBody(request) && request.is([...operation.types]) === false)
            return rejectResponse(response, 415, [
                {
                    code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
                    message: t('generic.error-unsupported-media-type'),
                    details: { accepted: [...operation.types] }
                }
            ]);

        next();
    };
};
