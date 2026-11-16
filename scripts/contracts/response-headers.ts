/**
 * @module
 * The response headers that no operation writes by hand, stamped onto the bundled `openapi.yaml`.
 *
 * Two steps, both run late in `./openapi-bundle`, after the steps that add an operation's own headers, so an operation's OWN header always wins:
 *
 * - {@link withAppLevelHeaders}: the headers every answer carries (`x-request-id`, `Cache-Control`,
 *   ...), listed once in the root's `x-app-level-headers`, onto every response.
 * - {@link withIdempotentReplay}: `Idempotent-Replayed` onto every response of an operation that takes
 *   an `Idempotency-Key`, except a 429 (the ledger never sees one). A shared response is reached
 *   through a generated `<Name>Replayable` twin, so a non-keyed operation keeps the original.
 *
 * Why stamped: the app sets these in middleware that runs before any route. A hand-copied list on
 * every operation is a published claim with no guard behind it, and it goes stale silently.
 *
 * @see docs/build/contract-fragmentation.md#where-the-rest-went
 */

import { OpenAPIV3, type OpenAPIV3_1 } from 'openapi-types';
import { operationsOf, type Operation, type OpenApiDocument, type Step } from './openapi-document';

/** The response header an idempotent operation's answers declare, and the component that describes it. */
const REPLAY_HEADER = 'Idempotent-Replayed';

/** The two `components/parameters` an operation takes its `Idempotency-Key` through. */
const IDEMPOTENCY_PARAMETERS: ReadonlySet<string> = new Set([
    '#/components/parameters/IdempotencyKeyHeader',
    '#/components/parameters/RequiredIdempotencyKeyHeader'
]);

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
 * Every response written inline on a write (anything but GET and HEAD). A write answer carries only
 * an `ETag` the API made itself, and a PUT answer none at all (RFC 9110 §8.8.3, §9.3.4, enforced by
 * `dropUnownedValidators`), so the optional `ETag` the root stamps on every read is left off these.
 * A write that does answer a real tag (`x-versioned`) declares it by hand, which wins.
 */
const writeResponsesOf = (document_: OpenApiDocument): Set<unknown> =>
    new Set(
        operationsOf(document_)
            .filter(
                ({ method }) =>
                    method !== OpenAPIV3.HttpMethods.GET && method !== OpenAPIV3.HttpMethods.HEAD
            )
            .flatMap(({ operation }) => Object.values(operation.responses ?? {}))
    );

/**
 * Stamp the root's `x-app-level-headers` onto every response, then spend the key.
 *
 * Never overwrites: a response that declares its own `Cache-Control` (a `no-store` download, a
 * `max-age` read) has said something more specific than the default.
 *
 * @throws Error if the root declares no map
 */
export const withAppLevelHeaders: Step = (document_) => {
    const headerMap = document_['x-app-level-headers'];
    if (!isHeaderMap(headerMap))
        throw new Error('[openapi] the root declares no `x-app-level-headers` map.');

    const onWrite = writeResponsesOf(document_);
    for (const response of inlineResponsesOf(document_)) {
        const headers = response.headers ?? {};
        for (const [name, component] of Object.entries(headerMap))
            if (!declares(headers, name) && !(onWrite.has(response) && name === 'ETag'))
                headers[name] = { $ref: `#/components/headers/${component}` };
        response.headers = headers;
    }

    // An instruction to this script, not part of the published contract.
    delete document_['x-app-level-headers'];
};

/** Whether the operation takes its `Idempotency-Key` through one of the shared parameters. */
const takesIdempotencyKey = (operation: Operation): boolean =>
    (operation.parameters ?? []).some(
        (parameter) => '$ref' in parameter && IDEMPOTENCY_PARAMETERS.has(parameter.$ref)
    );

/** The status the ledger never sees: every budget refuses before the key is claimed. */
const NEVER_STORED_STATUS = '429';

/** The `components/responses/` prefix a shared response is referenced by. */
const RESPONSE_REF_PREFIX = '#/components/responses/';

/** `response` with `Idempotent-Replayed` declared beside the headers it already has. */
const withReplayHeader = <TResponse extends OpenAPIV3_1.ResponseObject>(
    response: TResponse
): TResponse => {
    response.headers = {
        ...response.headers,
        [REPLAY_HEADER]: { $ref: `#/components/headers/${REPLAY_HEADER}` }
    };
    return response;
};

/**
 * The `<Name>Replayable` twin of a shared response: a deep clone plus the replay header, made once
 * per component. A non-keyed operation keeps pointing at the original, which stays without it.
 *
 * @param document_ - the bundle, whose `components/responses` gets the twin
 * @param operation - `METHOD /path`, for the message
 * @param name - the shared response's key under `components/responses`
 * @returns the `$ref` to the twin
 * @throws Error if the component is missing or is itself a `$ref`
 */
const replayableTwinRef = (
    document_: OpenApiDocument,
    operation: string,
    name: string
): { $ref: string } => {
    const twinName = `${name}Replayable`;
    const responses = document_.components?.responses;
    const original = responses?.[name];
    if (responses === undefined || original === undefined || '$ref' in original)
        throw new Error(
            `[openapi] ${operation}: \`${name}\` is not an inline shared response to clone for \`${REPLAY_HEADER}\`.`
        );
    // The deep clone is the point: a twin that shared its headers object would leak into the original.
    responses[twinName] ??= withReplayHeader(structuredClone(original));
    return { $ref: `${RESPONSE_REF_PREFIX}${twinName}` };
};

/**
 * Declare `Idempotent-Replayed` on every response of one idempotent operation but a 429.
 *
 * An inline response gets the header in place; a `$ref` one points at its twin.
 *
 * @param document_ - the bundle
 * @param operation - `METHOD /path`, for the message
 * @param target - the operation
 */
const declareReplay = (document_: OpenApiDocument, operation: string, target: Operation): void => {
    for (const [status, response] of Object.entries(target.responses ?? {})) {
        if (status === NEVER_STORED_STATUS) continue;
        if (!('$ref' in response)) {
            withReplayHeader(response);
            continue;
        }
        if (!response.$ref.startsWith(RESPONSE_REF_PREFIX))
            throw new Error(
                `[openapi] ${operation}: ${status} points outside components/responses.`
            );
        target.responses![status] = replayableTwinRef(
            document_,
            operation,
            response.$ref.slice(RESPONSE_REF_PREFIX.length)
        );
    }
};

/**
 * Declare `Idempotent-Replayed` on every response of an operation that takes an `Idempotency-Key`,
 * except a 429, which the ledger never sees (every budget refuses before the key is claimed).
 *
 * Marker is the parameter, not a hand-kept list: adding the key to a route is all it takes.
 *
 * @throws Error if a `$ref` response is not an inline shared one, so there is nothing to clone
 */
export const withIdempotentReplay: Step = (document_) => {
    for (const { route, method, operation } of operationsOf(document_))
        if (takesIdempotencyKey(operation))
            declareReplay(document_, `${method.toUpperCase()} ${route}`, operation);
};
