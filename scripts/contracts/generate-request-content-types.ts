#!/usr/bin/env tsx
/*
 * Generates the request media-type table from `openapi.yaml`: for every operation that declares a
 * `requestBody`, the content types it accepts; a write (POST, PUT, PATCH, DELETE) without one is listed with none, so any body is refused. The 415 guard
 * (`src/infrastructure/http/middlewares/content-type.ts`) reads it, so a body in a type the
 * contract does not declare is refused instead of arriving as an empty `{}`. Each row carries its
 * path matcher as a regex literal, so the guard compiles nothing at boot.
 *
 * It also writes `api/operation-routes.ts` beside it: for every path, the methods the contract gives
 * it and the module that owns it. The 405 handler
 * (`src/infrastructure/http/middlewares/method-not-allowed.ts`) reads it, so a known path asked
 * with the wrong method answers 405 + `Allow` instead of the catch-all's 404.
 *
 * Backend-only: the frontend has no server to guard. Written beside the other generated contract
 * files under `api/`, which `npm run gen:api` rebuilds from scratch.
 *
 * `--check` writes nothing and exits 1 on a mismatch (the shared `writeOrCheck` helper).
 *
 * Usage: tsx scripts/contracts/generate-request-content-types.ts --out <path> [--check]
 * (`--out` names the content-types file; the routes file lands in the same folder.)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeOrCheck } from './generated-file';
import { HTTP_METHODS, parseOpenApi } from './openapi-document';
import { requiredPath } from '../cli';

/** The HTTP methods whose body the guard checks. `get` and `head` carry none by contract. */
const BODY_METHODS = ['post', 'put', 'patch', 'delete'] as const;

/** The repo root. `import.meta.url` rather than `__dirname`: this script runs as ESM. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The bundled root contract this generator reads. */
const INPUT = path.resolve(ROOT, 'openapi.yaml');

/** Absolute path of the file to generate, from `--out`. */
const OUTPUT = requiredPath('out', ROOT);

/** The bundled contract, parsed. */
const document = parseOpenApi(readFileSync(INPUT, 'utf8'));

/**
 * Compiles a contract path template into the text of a regex literal, so the guard never builds a
 * matcher at boot: `/products/{id}/restore` becomes `/^\/products\/[^/]+\/restore$/i`. Case-insensitive,
 * because Express routing is: `/Account` reaches the `/account` routes, so the gate must see it too.
 *
 * @param template - a contract path such as `/products/{id}/restore`
 * @returns the literal's source text, and how many `{param}` segments the template has
 */
const compileTemplate = (template: string): { literal: string; parameterCount: number } => {
    const segments = template.split('/');
    const source = segments
        .map((segment) =>
            segment.startsWith('{')
                ? '[^/]+'
                : segment.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)
        )
        .join(String.raw`\/`);
    return {
        literal: `/^${source}$/i`,
        parameterCount: segments.filter((segment) => segment.startsWith('{')).length
    };
};

/*
 * One row per operation that declares a body. Fewest parameters first, so a static segment
 * (`/products/search`) is tried before `/products/{id}`; ties by key, so a regeneration is a
 * stable diff.
 *
 * @returns the rows as source text.
 */
const renderRows = (): string[] =>
    Object.entries(document.paths ?? {})
        .flatMap(([route, operations]) =>
            BODY_METHODS.flatMap((method) => {
                const operation = operations?.[method];
                const body = operation?.requestBody;
                const types = Object.keys(body && 'content' in body ? body.content : {});
                // A write with no declared body refuses any body (`types: []`): a gateway that
                // strips a body must not turn a body-carrying request into a different one, and a
                // `{"reason": …}` sent to a button endpoint must not vanish with a 200.
                if (!operation) return [];
                const { literal, parameterCount } = compileTemplate(route);
                return [
                    {
                        key: `${method.toUpperCase()} ${route}`,
                        parameterCount,
                        text: `    { method: ${JSON.stringify(method.toUpperCase())}, pattern: ${literal}, parameterCount: ${String(parameterCount)}, types: ${JSON.stringify(types)} },`
                    }
                ];
            })
        )
        .toSorted(
            (left, right) =>
                left.parameterCount - right.parameterCount || left.key.localeCompare(right.key)
        )
        .map((row) => row.text);

/*
 * One row per path: the methods it declares and the module that owns it. Same order as the
 * content-type rows, for the same reason.
 *
 * @returns the rows as source text.
 */
const renderRouteRows = (): string[] =>
    Object.entries(document.paths ?? {})
        .map(([route, operations]) => {
            const methods = HTTP_METHODS.filter((method) => operations?.[method]).map((method) =>
                method.toUpperCase()
            );
            const owner = HTTP_METHODS.map((method) => operations?.[method]?.['x-module']).find(
                (name) => name !== undefined
            );
            const { literal, parameterCount } = compileTemplate(route);
            return {
                route,
                parameterCount,
                text: `    { pattern: ${literal}, parameterCount: ${String(parameterCount)}, module: ${JSON.stringify(owner ?? null)}, methods: ${JSON.stringify(methods)} },`
            };
        })
        .toSorted(
            (left, right) =>
                left.parameterCount - right.parameterCount || left.route.localeCompare(right.route)
        )
        .map((row) => row.text);

/** The whole routes file's text. */
const routesOutput =
    '// Code generated by `npm run gen:api`. DO NOT EDIT.\n' +
    '/*\n' +
    ' * GENERATED — do not edit manually.\n' +
    ' * Source: openapi.yaml  |  Regenerate: npm run gen:api\n' +
    ' */\n\n' +
    '/** One contract path, ready to match against a request. */\n' +
    'export interface OperationRoute {\n' +
    '    /** Matches the request path of the contract path template. */\n' +
    '    pattern: RegExp;\n' +
    '    /** How many `{param}` segments the template has — fewer means more specific. */\n' +
    '    parameterCount: number;\n' +
    '    /** The module that owns the path, or `null` for a system route (ping, probes). */\n' +
    '    module: string | null;\n' +
    '    /** Upper-case methods the contract declares on the path. */\n' +
    '    methods: readonly string[];\n' +
    '}\n\n' +
    '/** Every contract path, fewest path parameters first. */\n' +
    `export const OPERATION_ROUTES: readonly OperationRoute[] = [\n${renderRouteRows().join('\n')}\n];\n`;

/** The whole content-types file's text. */
const output =
    '// Code generated by `npm run gen:api`. DO NOT EDIT.\n' +
    '/*\n' +
    ' * GENERATED — do not edit manually.\n' +
    ' * Source: openapi.yaml  |  Regenerate: npm run gen:api\n' +
    ' */\n\n' +
    '/** One operation that declares a request body, ready to match against a request. */\n' +
    'export interface RequestContentType {\n' +
    '    /** Upper-case HTTP method. */\n' +
    '    method: string;\n' +
    "    /** Matches the request path of the operation's contract path template. */\n" +
    '    pattern: RegExp;\n' +
    '    /** How many `{param}` segments the template has — fewer means more specific. */\n' +
    '    parameterCount: number;\n' +
    "    /** The media types the contract declares for the operation's body. */\n" +
    '    types: readonly string[];\n' +
    '}\n\n' +
    '/** Every operation that declares a request body, fewest path parameters first. */\n' +
    `export const REQUEST_CONTENT_TYPES: readonly RequestContentType[] = [\n${renderRows().join('\n')}\n];\n`;

// Write the file, or under `--check` compare it with what is on disk.
writeOrCheck(OUTPUT, output, 'openapi.yaml');
writeOrCheck(path.join(path.dirname(OUTPUT), 'operation-routes.ts'), routesOutput, 'openapi.yaml');
