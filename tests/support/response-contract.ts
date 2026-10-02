/**
 * Judges one captured HTTP response against the schema `openapi.yaml` declares for it.
 *
 * `orval.config.ts`'s `generateEachHttpStatus` emits one Zod schema per documented status —
 * `Login200Response`, `Login422Response`, and so on — so a response is checked against the EXACT
 * shape its own status promises, success or error alike. `strict.response` is what makes these
 * schemas reject an unknown field rather than silently stripping it.
 *
 * A redirect and a binary body need no special-casing here: orval emits `zod.unknown()` for a
 * response with no JSON schema of its own (a 302, the invoice PDF), which accepts anything.
 *
 * `tests/support/contract.ts` calls this from one shared `afterEach`. The fuzz suite
 * (`tests/fuzz/endpoints.fuzz.test.ts`) calls it directly, once per generated request, so a
 * mismatch throws INSIDE `fast-check`'s property function and shrinks to the smallest failing
 * input rather than surfacing from an unrelated `afterEach`.
 */
import * as zod from 'zod';
import * as responseSchemas from '@api/schemas.zod';
import { listOperations, requiredResponseHeaders, type HttpMethod } from './spec-walk';
import type { Response } from 'supertest';

/** One documented operation, reduced to what a captured response is matched against. */
interface DeclaredRoute {
    method: HttpMethod;
    /** `{param}` segments accept anything; anchored at both ends so a sibling path can't match. */
    regex: RegExp;
    operationId: string;
    /** How many `{param}` segments the path has — breaks a tie when a literal sibling also matches. */
    paramCount: number;
}

/** Every operation the spec declares, as a matchable route — built once; the spec doesn't change mid-run. */
const DECLARED_ROUTES: DeclaredRoute[] = listOperations()
    .filter((operation): operation is typeof operation & { operationId: string } =>
        Boolean(operation.operationId)
    )
    .map((operation) => ({
        method: operation.method,
        regex: new RegExp(`^${operation.path.replaceAll(/{[^}]+}/g, '[^/]+')}$`),
        operationId: operation.operationId,
        paramCount: operation.pathParameters.length
    }));

/** Headers the spec marks `required`, per operation and status — built once, like the routes. */
const REQUIRED_HEADERS = requiredResponseHeaders();

/**
 * Every named export of the generated schema module, indexed by name.
 *
 * Cast-free: `{ ...responseSchemas }` is a fresh object literal, which TypeScript gives an implicit
 * index signature when the target type asks for one — unlike the namespace import itself, which
 * has none and so cannot be looked up by a name computed at runtime.
 */
const responseSchemaModule: Record<string, unknown> = { ...responseSchemas };

/** Narrows a dynamically-looked-up export to a schema `safeParse` can actually run. */
const isZodType = (value: unknown): value is zod.ZodType => value instanceof zod.ZodType;

/** `login` → `Login`, `getHealth` → `GetHealth` — matches orval's own schema naming. */
const pascalCase = (operationId: string): string =>
    `${operationId.charAt(0).toUpperCase()}${operationId.slice(1)}`;

/**
 * The operation a response's method + path belongs to, or `undefined` for an undeclared route.
 *
 * A literal path and a templated sibling can both match the same request — `/cart/{productId}`'s
 * `[^/]+` accepts the literal string `shipping-method` just as well as a real id. The most
 * SPECIFIC match (fewest `{param}` segments) wins, the same tie-break `cart/routes.ts` itself
 * relies on by mounting the literal route first.
 */
const operationFor = (method: HttpMethod, pathname: string): string | undefined => {
    const matches = DECLARED_ROUTES.filter(
        (route) => route.method === method && route.regex.test(pathname)
    );
    if (matches.length === 0) return undefined;

    return matches.toSorted((a, b) => a.paramCount - b.paramCount)[0].operationId;
};

/** The generated schema for one operation's documented status, or `undefined` when it isn't declared. */
const schemaFor = (operationId: string, status: number): zod.ZodType | undefined => {
    const schema = responseSchemaModule[`${pascalCase(operationId)}${String(status)}Response`];
    return isZodType(schema) ? schema : undefined;
};

/**
 * The body to judge: the text of a `text/*` response, nothing for a 204, `.body` otherwise.
 *
 * supertest/superagent only fill `.body` for a JSON (or urlencoded) response; a `text/plain` one —
 * the Prometheus exposition text — lands in `.text` instead, and `.body` stays `{}`. A 204 carries
 * no content (RFC 9110 §15.3.5), which orval models as `zod.void()`, yet `.body` is still `{}`.
 */
const readBody = (response: Response): unknown => {
    if (response.status === 204) return undefined;
    return response.type.startsWith('text/') ? response.text : response.body;
};

/**
 * Checks one captured response against `openapi.yaml`, throwing a plain `Error` on a mismatch.
 *
 * An undeclared path is not this function's job — that's the 404-envelope contract test's own
 * point — so it returns rather than throws. An operation that DOES match but answers a status it
 * never documented is a real contract break, exactly as much as a documented status whose body
 * doesn't fit, so both throw.
 * @param response - a real response from `supertest(app)`
 * @throws {Error} when the status is undocumented for its operation, or the body doesn't match
 */
export const assertResponseMatchesContract = (response: Response): void => {
    const { pathname } = new URL(response.request.url);
    // Node's http reports the verb upper-case; `HttpMethod` (and the spec walk) is lower-case —
    // safe because this app only ever issues the five methods the spec can declare an operation
    // under.
    const method = response.request.method.toLowerCase() as HttpMethod;

    const operationId = operationFor(method, pathname);
    if (!operationId) return;

    const schema = schemaFor(operationId, response.status);
    if (!schema)
        throw new Error(
            `${method.toUpperCase()} ${pathname} answered ${String(response.status)}, which ${operationId} does not document`
        );

    const missingHeader = (REQUIRED_HEADERS[operationId]?.[String(response.status)] ?? []).find(
        (name) => !(name in response.headers)
    );
    if (missingHeader)
        throw new Error(
            `${method.toUpperCase()} ${pathname} (${String(response.status)}) is missing the \`${missingHeader}\` header ${operationId} documents as required`
        );

    const body = readBody(response);
    const result = schema.safeParse(body);
    if (!result.success)
        throw new Error(
            `${method.toUpperCase()} ${pathname} (${String(response.status)}) does not match ${operationId}'s documented shape:\n${zod.prettifyError(result.error)}`
        );
};
