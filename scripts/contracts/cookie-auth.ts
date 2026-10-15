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

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/** Methods that change nothing, so a cookie on one needs no origin check. */
const SAFE_METHODS = new Set(['get', 'head', 'options']);

/** Every method an OpenAPI path item may hold as an operation. */
const OPERATION_METHODS = ['get', 'put', 'post', 'patch', 'delete', 'head', 'options', 'trace'];

/** As much of an operation as this step reads and writes. */
interface SecuredOperation {
    security?: Record<string, unknown>[];
    responses?: Record<string, unknown>;
}

/** The bundled document, as far as this step reads it. */
interface Bundled {
    paths?: Record<string, Record<string, unknown>>;
}

/** Whether a security requirement list names `bearerAuth` among its alternatives. */
const takesBearer = (
    security: SecuredOperation['security']
): security is Record<string, unknown>[] =>
    Array.isArray(security) && security.some((alternative) => 'bearerAuth' in alternative);

/** Narrows a path-item entry to an operation; anything else under a path is not one. */
const isOperation = (value: unknown): value is SecuredOperation =>
    typeof value === 'object' && value !== null;

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
    // `yaml`: parse the bundled document into a plain object graph.
    // https://eemeli.org/yaml/#parse-yaml-to-json-value
    const document_ = parseYaml(bundled) as Bundled;

    for (const [method, operation] of Object.values(document_.paths ?? {}).flatMap((item) =>
        OPERATION_METHODS.map((name) => [name, item[name]] as const)
    )) {
        if (!isOperation(operation) || !takesBearer(operation.security)) continue;

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
