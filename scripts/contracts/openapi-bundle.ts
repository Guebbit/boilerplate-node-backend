/**
 * `openapi.yaml` — the REST contract, compiled from one standalone document per module.
 *
 * WHAT A MODULE OWNS: `src/modules/<name>/openapi.yaml` is a complete, valid OpenAPI document —
 * the paths under that module's `basePath` and the schemas only those paths reference. Anything
 * two or more modules use lives in `openapi.root.yaml` and is reached by `$ref` across the file
 * boundary, never by assuming a neighbour's text is concatenated above.
 *
 * Compiled by `redocly bundle` rather than concatenated, because the comments that matter are in
 * the MODULE files, which are authored, not in the bundle, which nobody reads by hand. One step
 * runs after it, on the bundle: {@link withAppLevelResponses} merges the root's
 * `x-app-level-responses` (429, and 400/413/415 for a body-carrying operation) into every
 * operation that doesn't already declare its own.
 *
 * Deleting a module is `rm -rf` of its folder plus its block in the root's path index; forgetting
 * the second half is a bundle failure naming the exact line.
 *
 * See: docs/api/contract-fragmentation.md#why-the-rest-contract-stopped-concatenating-and-the-rest-did-not
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import path from 'node:path';
import { REPO_ROOT, type CompiledBundle } from './bundle-kinds';

/**
 * The modules contributing a standalone document, in the order the contract is assembled in.
 *
 * The order is the narrative one the contract has always had — what a caller meets first, then the
 * path a customer walks through the shop — and it is the order the client collections group their
 * requests in.
 */
export const MODULE_SECTIONS = [
    'locales',
    'observability',
    'audit-logs',
    'antibot',
    'account',
    'addresses',
    'users',
    'feedback',
    'products',
    'cart',
    'wishlist',
    'orders',
    'payments',
    'delivery',
    'inventory',
    'webhooks',
    'api-keys'
] as const;

type ModuleSection = (typeof MODULE_SECTIONS)[number];

/**
 * Every section a path can be filed under: the modules, plus the shell.
 *
 * `system` owns no folder — `GET /` is the application answering for itself, so it is written into
 * the root document rather than into a module. It is still a section for anything that groups paths
 * by owner, which is why the client collections show a System folder.
 */
export const SECTION_ORDER = ['system', ...MODULE_SECTIONS] as const;

export type SectionName = (typeof SECTION_ORDER)[number];

/** A module's standalone contract. */
export const moduleSpec = (section: ModuleSection): string =>
    path.join(REPO_ROOT, 'src', 'modules', section, 'openapi.yaml');

/** What no module owns: the preamble, the shared components, and `GET /`. */
const ROOT_SPEC = path.join(REPO_ROOT, 'shared', 'contracts', 'openapi.root.yaml');

/** The committed contract every tool reads. */
const OPENAPI_OUTPUT = path.join(REPO_ROOT, 'openapi.yaml');

/**
 * A path key as it appears in a module document: four spaces, then the path.
 *
 * Textual on purpose. This is asked for every path on every collection regeneration, and the answer
 * — which module owns which URL — is a property of which FILE the path is written in, not of
 * anything the parsed document says.
 */
const PATH_LINE = /^ {4}(\/\S*):\s*$/gm;

/**
 * What the ROOT declares itself, rather than delegating to a module.
 *
 * Parsed rather than matched, because the root's `paths:` holds both kinds — the shell's own
 * operations and one `$ref` per module path — and only the first kind is the system section's. A
 * `$ref` entry is somebody else's path passing through.
 */
const rootPaths = (): string[] => {
    const document_ = parseYaml(readFileSync(ROOT_SPEC, 'utf8')) as {
        paths: Record<string, Record<string, unknown>>;
    };
    return Object.entries(document_.paths)
        .filter(([, item]) => !('$ref' in item))
        .map(([url]) => url);
};

/** Every path a section declares, in the order it declares them. */
export const sectionPaths = (section: SectionName): string[] =>
    section === 'system'
        ? rootPaths()
        : [...readFileSync(moduleSpec(section), 'utf8').matchAll(PATH_LINE)].map(
              (match) => match[1]
          );

/**
 * The HTTP methods an OpenAPI path item may hold. Everything else under a path — `parameters`,
 * `summary`, `$ref` — is not an operation and must not collect responses.
 */
const OPERATION_METHODS = ['get', 'put', 'post', 'patch', 'delete', 'head', 'options', 'trace'];

/** One entry of the root's `x-app-level-responses` map — see the comment beside it there. */
interface AppLevelResponse {
    response: string;
    appliesTo: 'all' | 'requestBody';
}

/** As much of an OpenAPI operation as this step reads. */
interface Operation {
    requestBody?: unknown;
    responses?: Record<string, unknown>;
}

/** The shape this step reads out of the bundled document, and writes back into. */
interface BundledDocument {
    'x-app-level-responses'?: Record<string, AppLevelResponse>;
    paths?: Record<string, Record<string, unknown>>;
}

/**
 * Narrows a path-item entry to the fields this step reads. Only the keys in
 * {@link OPERATION_METHODS} are ever passed in, so all this rejects is a method the path item
 * does not declare.
 */
const isOperation = (value: unknown): value is Operation =>
    typeof value === 'object' && value !== null;

/** Every operation the bundle holds, flattened out of its paths. */
const operationsOf = (document_: BundledDocument): Operation[] =>
    Object.values(document_.paths ?? {}).flatMap((pathItem) =>
        OPERATION_METHODS.map((method) => pathItem[method]).filter((entry) => isOperation(entry))
    );

/**
 * Whether this app-level response applies to this operation.
 *
 * `requestBody` is not a guess at the method: a `DELETE` that accepts a body can be refused for
 * its size exactly as a `POST` can, and a `GET` that accepts none cannot. The operation's own
 * declaration is the only thing that knows.
 */
const appliesToOperation = (entry: AppLevelResponse, operation: Operation): boolean =>
    entry.appliesTo === 'all' || 'requestBody' in operation;

/**
 * This operation's responses, plus every app-level one it does not already answer for itself.
 *
 * NEVER overwrites: an operation declaring its own `429` has said something more specific than
 * the global default — a named per-route budget with its own `Retry-After` semantics, say — and
 * this step fills gaps rather than flattening deliberate answers.
 */
const withDefaults = (
    operation: Operation,
    appLevel: Record<string, AppLevelResponse>
): Record<string, unknown> => {
    const responses: Record<string, unknown> = { ...operation.responses };

    for (const [status, entry] of Object.entries(appLevel))
        if (!(status in responses) && appliesToOperation(entry, operation))
            responses[status] = { $ref: `#/components/responses/${entry.response}` };

    return responses;
};

/**
 * Merge the root's `x-app-level-responses` into every operation the bundle holds.
 *
 * Runs on the BUNDLED document rather than on each fragment, because `$ref`s are already resolved
 * by then and an operation is reachable exactly once. Round-tripping the YAML is free here: the
 * output is a generated artefact nobody hand-edits, and redocly has already dropped every comment
 * the sources carried.
 *
 * See: docs/api/contract-fragmentation.md
 */
export const withAppLevelResponses = (bundled: string): string => {
    const document_ = parseYaml(bundled) as BundledDocument;
    const appLevel = document_['x-app-level-responses'];

    if (!appLevel) throw new Error('[openapi] the root declares no `x-app-level-responses`.');

    for (const operation of operationsOf(document_))
        operation.responses = withDefaults(operation, appLevel);

    // Deleted once it has been spent: it is an instruction to this script, and a consumer reading
    // the published contract has no use for a key describing how the contract was assembled.
    delete document_['x-app-level-responses'];

    /*
     * `lineWidth: 0` disables line folding. A folded `description:` is still valid YAML and still
     * parses to the same string, but it rewraps whenever unrelated text shifts, which turns every
     * regeneration into a diff nobody can read.
     */
    return stringifyYaml(document_, { lineWidth: 0 });
};

/** What the committed contract opens with, so the file says what it is. */
const MARKER =
    '# Code generated by `npm run contracts:bundle`. DO NOT EDIT.\n' +
    '# Sources: shared/contracts/openapi.root.yaml and src/modules/*/openapi.yaml\n';

let compiled: string | undefined;

/**
 * Run `redocly bundle` and return the contract.
 *
 * `--output` to a file and read it back rather than capturing stdout: redocly writes its progress
 * there, and a contract with `bundling …` prepended to it is one nothing can parse.
 *
 * Memoised because a run asks for the document more than once — once to decide whether the
 * committed copy is stale, once to write it, and again in the second phase that lets the client
 * collections read a current contract. The sources cannot change mid-run, so the answer cannot
 * either, and bundling three times only makes the log look like something went wrong.
 */
const compile = (): string => {
    if (compiled !== undefined) return compiled;

    const temporary = path.join(REPO_ROOT, 'node_modules', '.cache', 'openapi.bundle.yaml');
    mkdirSync(path.dirname(temporary), { recursive: true });

    try {
        execFileSync(
            process.execPath,
            [
                path.join(REPO_ROOT, 'node_modules', '@redocly', 'cli', 'bin', 'cli.js'),
                'bundle',
                ROOT_SPEC,
                '--output',
                temporary
            ],
            { cwd: REPO_ROOT, stdio: ['ignore', 'ignore', 'pipe'] }
        );
    } catch (error) {
        /*
         * Almost always a `$ref` the root names and no file answers — a module deleted without its
         * block leaving the path index. Redocly says which line, so let it through verbatim rather
         * than wrapping it in a summary that hides the location.
         */
        const details = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
        throw new Error(`[openapi] redocly bundle failed.\n${details}`);
    }

    /*
     * The marker has to be prepended rather than written into a source, because redocly PARSES: a
     * comment at the top of `openapi.root.yaml` would be dropped like every other one. Two lines of
     * YAML comment ahead of `openapi: 3.0.3` are legal, and spectral, orval and the AsyncAPI-style
     * viewers all read past them — the alternative is the one artefact in the repo that cannot say
     * what it is.
     */
    compiled = MARKER + withAppLevelResponses(readFileSync(temporary, 'utf8'));
    return compiled;
};

export const openapiBundle: CompiledBundle = {
    name: 'openapi',
    label: 'openapi.yaml',
    output: OPENAPI_OUTPUT,
    compiled: true,
    content: compile,
    sources: () => [ROOT_SPEC, ...MODULE_SECTIONS.map((section) => moduleSpec(section))]
};
