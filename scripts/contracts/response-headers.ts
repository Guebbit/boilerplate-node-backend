/**
 * @module
 * The response headers that no operation writes by hand, stamped onto the bundled `openapi.yaml`.
 *
 * Two steps, both run late in `./openapi-bundle`, after the steps that add an operation's own headers, so an operation's OWN header always wins:
 *
 * - {@link withAppLevelHeaders}: the headers every answer carries (`x-request-id`, `Cache-Control`,
 *   ...), listed once in the root's `x-app-level-headers`, onto every response.
 * - {@link withIdempotentReplay}: `Idempotent-Replay` onto the 2xx of every operation that takes an
 *   `Idempotency-Key`.
 *
 * Why stamped: the app sets these in middleware that runs before any route. A hand-copied list on
 * every operation is a published claim with no guard behind it, and it goes stale silently.
 *
 * See: docs/api/contract-fragmentation.md
 */

import type { OpenAPIV3_1 } from 'openapi-types';
import { stringify as stringifyYaml } from 'yaml';
import {
    operationsOf,
    parseOpenApi,
    type Operation,
    type OpenApiDocument
} from './openapi-document';

/** The response header an idempotent operation's 2xx declares, and the component that describes it. */
const REPLAY_HEADER = 'Idempotent-Replay';

/** The two `components/parameters` an operation takes its `Idempotency-Key` through. */
const IDEMPOTENCY_PARAMETERS: ReadonlySet<string> = new Set([
    '#/components/parameters/IdempotencyKeyHeader',
    '#/components/parameters/RequiredIdempotencyKeyHeader'
]);

/** The root's header map, which {@link withAppLevelHeaders} spends. */
interface RootHeaders {
    'x-app-level-headers'?: unknown;
}

/** Narrows the root's map to `{ <HTTP header name>: <components/headers key> }`. */
const isHeaderMap = (value: unknown): value is Record<string, string> =>
    typeof value === 'object' &&
    value !== null &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((item) => typeof item === 'string');

/** Whether `headers` already declares `name`, whatever its case: HTTP header names are case-insensitive. */
const declares = (headers: Record<string, unknown>, name: string): boolean =>
    Object.keys(headers).some((own) => own.toLowerCase() === name.toLowerCase());

/**
 * Every response written in place: each operation's inline answers, and the shared ones under
 * `components/responses`. A `$ref` response is skipped: its component is in this list already.
 */
const inlineResponsesOf = (document_: OpenApiDocument): OpenAPIV3_1.ResponseObject[] =>
    [
        ...operationsOf(document_).flatMap(({ operation }) =>
            Object.values(operation.responses ?? {})
        ),
        ...Object.values(document_.components?.responses ?? {})
    ].filter((response): response is OpenAPIV3_1.ResponseObject => !('$ref' in response));

/**
 * Stamp the root's `x-app-level-headers` onto every response, then spend the key.
 *
 * Never overwrites: a response that declares its own `Cache-Control` (a `no-store` download, a
 * `max-age` read) has said something more specific than the default.
 *
 * @param bundled - the bundled OpenAPI document, as YAML text
 * @returns the document with the app-level headers declared on every response
 * @throws Error if the root declares no map, or the document does not parse to an object
 */
export const withAppLevelHeaders = (bundled: string): string => {
    const document_ = parseOpenApi<RootHeaders>(bundled);

    const headerMap = document_['x-app-level-headers'];
    if (!isHeaderMap(headerMap))
        throw new Error('[openapi] the root declares no `x-app-level-headers` map.');

    for (const response of inlineResponsesOf(document_)) {
        const headers = response.headers ?? {};
        for (const [name, component] of Object.entries(headerMap))
            if (!declares(headers, name))
                headers[name] = { $ref: `#/components/headers/${component}` };
        response.headers = headers;
    }

    // An instruction to this script, not part of the published contract.
    delete document_['x-app-level-headers'];

    // `lineWidth: 0` turns off line folding, so a rewrap never shows up as a diff.
    // https://eemeli.org/yaml/#tostring-options
    return stringifyYaml(document_, { lineWidth: 0 });
};

/** Whether the operation takes its `Idempotency-Key` through one of the shared parameters. */
const takesIdempotencyKey = (operation: Operation): boolean =>
    (operation.parameters ?? []).some(
        (parameter) => '$ref' in parameter && IDEMPOTENCY_PARAMETERS.has(parameter.$ref)
    );

/**
 * Hang `Idempotent-Replay` on every 2xx of one idempotent operation.
 *
 * @param operation - `METHOD /path`, for the message
 * @param target - the operation
 * @throws Error if a 2xx is a `$ref`
 */
const declareReplay = (operation: string, target: Operation): void => {
    for (const [status, response] of Object.entries(target.responses ?? {})) {
        if (!status.startsWith('2')) continue;
        if ('$ref' in response)
            throw new Error(
                `[openapi] ${operation}: an idempotent operation needs an inline ${status} to hang \`${REPLAY_HEADER}\` on, not a $ref.`
            );
        response.headers = {
            ...response.headers,
            [REPLAY_HEADER]: { $ref: `#/components/headers/${REPLAY_HEADER}` }
        };
    }
};

/**
 * Declare `Idempotent-Replay` on every 2xx of an operation that takes an `Idempotency-Key`.
 *
 * Marker is the parameter, not a hand-kept list: adding the key to a route is all it takes.
 *
 * @param bundled - the bundled OpenAPI document, as YAML text
 * @returns the document with the replay header declared on each idempotent operation's 2xx
 * @throws Error if an idempotent operation's 2xx is a `$ref`, which cannot take a header of its own
 */
export const withIdempotentReplay = (bundled: string): string => {
    const document_ = parseOpenApi(bundled);

    for (const { route, method, operation } of operationsOf(document_))
        if (takesIdempotencyKey(operation))
            declareReplay(`${method.toUpperCase()} ${route}`, operation);

    return stringifyYaml(document_, { lineWidth: 0 });
};
