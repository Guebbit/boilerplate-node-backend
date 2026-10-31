/**
 * @module
 * What every step on the bundled `openapi.yaml` shares: the document type, the HTTP methods an
 * operation can sit under, one parse guard and one walk over the operations.
 *
 * Types and the method list come from `openapi-types` (the same package Modelina already pulls
 * in), so no step keeps its own copy of "what an OpenAPI document looks like".
 *
 * See: docs/api/contract-fragmentation.md
 */

import { OpenAPIV3, type OpenAPIV3_1 } from 'openapi-types';
import { parse as parseYaml } from 'yaml';

/**
 * The vendor extensions a fragment may put on an operation.
 *
 * `x-cache` is the cache policy (`private-no-cache`, `revalidate`, `max-age: <s>` or `no-store`),
 * `x-module` the owning module (stamped by the bundler), `x-error-codes` the error codes it
 * answers with, by HTTP status.
 */
interface OperationExtensions {
    'x-cache'?: string;
    'x-module'?: string;
    'x-error-codes'?: Record<string, string[]>;
}

/** An OpenAPI 3.1 document whose operations carry {@link OperationExtensions}. */
export type OpenApiDocument = OpenAPIV3_1.Document<OperationExtensions>;

/** An operation of {@link OpenApiDocument}. */
export type Operation = OpenAPIV3_1.OperationObject<OperationExtensions>;

/** One operation, with the route and the method it sits under. */
export interface OperationEntry {
    route: string;
    method: OpenAPIV3.HttpMethods;
    operation: Operation;
}

/**
 * The HTTP methods an OpenAPI path item may hold an operation under. Everything else under a
 * path (`parameters`, `summary`, `$ref`) is not an operation and must not collect responses.
 */
export const HTTP_METHODS: readonly OpenAPIV3.HttpMethods[] = Object.values(OpenAPIV3.HttpMethods);

/** Whether a path-item key names an HTTP method (as opposed to `parameters`, `summary`, ...). */
export const isHttpMethod = (key: string): key is OpenAPIV3.HttpMethods =>
    Object.values<string>(OpenAPIV3.HttpMethods).includes(key);

/**
 * Parses the bundled document and refuses anything that is not a YAML object, so a malformed
 * bundle fails here with a clear message rather than as a `TypeError` several calls downstream.
 *
 * @param bundled - the bundled OpenAPI document, as YAML text
 * @returns the document, plus whichever root extension keys (`x-...`) the caller names in `TExtra`
 * @throws Error if the text does not parse to an object
 */
export const parseOpenApi = <TExtra extends object = object>(
    bundled: string
): OpenApiDocument & TExtra => {
    // `yaml`: parse into a plain object graph, typed `unknown` until the guard below narrows it.
    // https://eemeli.org/yaml/#parse-yaml-to-json-value
    const parsed: unknown = parseYaml(bundled);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new Error('[openapi] the bundled document did not parse to an object.');
    // The shape is the bundler's own output, checked structurally by the steps that read it.
    return parsed as OpenApiDocument & TExtra;
};

/**
 * Every operation the document holds, flattened out of its paths.
 *
 * @param document - the parsed document
 * @returns one entry per `paths.<route>.<method>` that holds an object
 */
export const operationsOf = (document: OpenApiDocument): OperationEntry[] =>
    Object.entries(document.paths ?? {}).flatMap(([route, pathItem]) =>
        HTTP_METHODS.flatMap((method) => {
            const operation = pathItem?.[method];
            return operation ? [{ route, method, operation }] : [];
        })
    );
