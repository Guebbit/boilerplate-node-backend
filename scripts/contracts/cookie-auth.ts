/**
 * @module
 * `cookieAuth` as a second way to authenticate every operation that takes a bearer, plus the
 * `403` such a request can earn.
 *
 * In `cookie` mode the `__Host-session` cookie authenticates every route a bearer does, and an
 * UNSAFE request it authenticates is refused with 403 unless its `Origin` is an allowed frontend
 * origin (`kernel/middlewares/authorizations.ts#continueWithCookie`). Declaring that on each
 * operation by hand would be a published claim with no guard behind it, so this step derives it
 * from `bearerAuth`, the one thing every such operation already says.
 *
 * Runs on the bundled document, like the other post-bundle steps in `./openapi-bundle`.
 *
 * See: docs/api/contract-fragmentation.md
 */

import { stringify as stringifyYaml } from 'yaml';
import { operationsOf, parseOpenApi, type Operation } from './openapi-document';

/** Methods that change nothing, so a cookie on one needs no origin check. */
const SAFE_METHODS = new Set(['get', 'head', 'options']);

/** Whether a security requirement list names `bearerAuth` among its alternatives. */
const takesBearer = (
    security: Operation['security']
): security is NonNullable<Operation['security']> =>
    Array.isArray(security) && security.some((alternative) => 'bearerAuth' in alternative);

/**
 * Add the `cookieAuth` alternative to every operation that takes `bearerAuth`, and a `403` to the
 * unsafe ones that do not already declare their own.
 *
 * NEVER overwrites a `403`: an operation's own is more specific than the origin refusal.
 *
 * @param bundled - the bundled OpenAPI document, as YAML
 * @returns the document with the cookie alternative and the origin refusal declared
 */
export const withCookieAuth = (bundled: string): string => {
    const document_ = parseOpenApi(bundled);
    for (const { method, operation } of operationsOf(document_)) {
        if (!takesBearer(operation.security)) continue;
        if (operation.security.every((alternative) => !('cookieAuth' in alternative)))
            operation.security.push({ cookieAuth: [] });
        if (!SAFE_METHODS.has(method) && !(operation.responses && '403' in operation.responses))
            operation.responses = {
                ...operation.responses,
                '403': { $ref: '#/components/responses/Forbidden' }
            };
    }
    // `lineWidth: 0`: no folding, so an unrelated edit never rewraps a description.
    return stringifyYaml(document_, { lineWidth: 0 });
};
