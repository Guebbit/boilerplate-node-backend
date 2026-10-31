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

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/** Every method an OpenAPI path item may hold as an operation. */
const OPERATION_METHODS = ['get', 'put', 'post', 'patch', 'delete', 'head', 'options', 'trace'];

/** The response header an idempotent operation's 2xx declares, and the component that describes it. */
const REPLAY_HEADER = 'Idempotent-Replay';

/** The two `components/parameters` an operation takes its `Idempotency-Key` through. */
const IDEMPOTENCY_PARAMETERS: ReadonlySet<string> = new Set([
    '#/components/parameters/IdempotencyKeyHeader',
    '#/components/parameters/RequiredIdempotencyKeyHeader'
]);

/** As much of a response object as these steps read and write. */
interface ResponseObject {
    $ref?: string;
    headers?: Record<string, unknown>;
}

/** As much of an operation as these steps read. */
interface OperationObject {
    parameters?: { $ref?: string }[];
    responses?: Record<string, ResponseObject>;
}

/** The bundled document, as far as these steps read and write it. */
interface Bundled {
    'x-app-level-headers'?: unknown;
    paths?: Record<string, Record<string, OperationObject | undefined>>;
    components?: { responses?: Record<string, ResponseObject> };
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

/** Every operation the bundle holds. */
const operationsOf = (document_: Bundled): OperationObject[] =>
    Object.values(document_.paths ?? {}).flatMap((pathItem) =>
        OPERATION_METHODS.flatMap((method) => {
            const operation = pathItem[method];
            return operation === undefined ? [] : [operation];
        })
    );

/**
 * Every response written in place: each operation's inline answers, and the shared ones under
 * `components/responses`. A `$ref` response is skipped: its component is in this list already.
 */
const inlineResponsesOf = (document_: Bundled): ResponseObject[] =>
    [
        ...operationsOf(document_).flatMap((operation) => Object.values(operation.responses ?? {})),
        ...Object.values(document_.components?.responses ?? {})
    ].filter((response) => response.$ref === undefined);

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
    // `yaml`: parse the bundled document into a plain object graph.
    // https://eemeli.org/yaml/#parse-yaml-to-json-value
    const document_ = parseYaml(bundled) as Bundled | null;
    if (typeof document_ !== 'object' || document_ === null)
        throw new Error('[openapi] the bundled document did not parse to an object.');

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
const takesIdempotencyKey = (operation: OperationObject): boolean =>
    (operation.parameters ?? []).some(
        (parameter) => parameter.$ref !== undefined && IDEMPOTENCY_PARAMETERS.has(parameter.$ref)
    );

/**
 * Hang `Idempotent-Replay` on every 2xx of one idempotent operation.
 *
 * @param operation - `METHOD /path`, for the message
 * @param target - the operation
 * @throws Error if a 2xx is a `$ref`
 */
const declareReplay = (operation: string, target: OperationObject): void => {
    for (const [status, response] of Object.entries(target.responses ?? {})) {
        if (!status.startsWith('2')) continue;
        if (response.$ref !== undefined)
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
    // `yaml`: parse the bundled document into a plain object graph.
    // https://eemeli.org/yaml/#parse-yaml-to-json-value
    const document_ = parseYaml(bundled) as Bundled | null;
    if (typeof document_ !== 'object' || document_ === null)
        throw new Error('[openapi] the bundled document did not parse to an object.');

    for (const [route, pathItem] of Object.entries(document_.paths ?? {}))
        for (const method of OPERATION_METHODS) {
            const operation = pathItem[method];
            if (operation === undefined || !takesIdempotencyKey(operation)) continue;
            declareReplay(`${method.toUpperCase()} ${route}`, operation);
        }

    return stringifyYaml(document_, { lineWidth: 0 });
};
