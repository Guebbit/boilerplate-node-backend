/**
 * `openapi.yaml` — the REST contract, compiled from one standalone document per module.
 *
 * WHAT A MODULE OWNS: `src/modules/<name>/openapi.yaml` is a complete, valid OpenAPI document —
 * the paths under that module's `basePath` and the schemas only those paths reference. Anything
 * two or more modules use lives in `openapi.root.yaml` and is reached by `$ref` across the file
 * boundary, never by assuming a neighbour's text is concatenated above.
 *
 * Compiled by `redocly bundle` rather than concatenated, because the comments that matter are in
 * the MODULE files, which are authored, not in the bundle, which nobody reads by hand. Four steps
 * run after it, on the bundle: {@link withAppLevelResponses} merges the root's
 * `x-app-level-responses` (429, and 400/413/415 for a body-carrying operation) into every
 * operation that doesn't already declare its own; {@link withVersionedResources} hangs `ETag`,
 * `If-Match` and 412 on every path marked `x-versioned`; {@link withModuleStamps} tags every operation
 * with the `x-module` its owning fragment names — never hand-written per operation; and
 * {@link withErrorCodes} publishes every fragment's own `x-error-codes` as one collected catalogue.
 *
 * The root's path index and tag list are completed from the fragments on disk before redocly runs
 * ({@link assembleRoot}), so adding a module is its own `openapi.yaml` and deleting one is `rm -rf`.
 *
 * See: docs/api/contract-fragmentation.md#why-the-rest-contract-stopped-concatenating-and-the-rest-did-not
 */

import { execFileSync } from 'node:child_process';
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import path from 'node:path';
import { REPO_ROOT, type CompiledBundle } from './bundle-kinds';
import { orderSections } from './section-order';
import { assembleRoot, readModuleFragments } from './root-assembly';

/**
 * The narrative order the contract has always had — what a caller meets first, then the path a
 * customer walks through the shop — and the order the client collections group their requests in.
 *
 * A PREFERENCE, not a registry: {@link MODULE_SECTIONS} discovers membership from disk, so a
 * module that is deleted drops out and a new one is appended alphabetically (`scripts/contracts/section-order.ts`).
 */
const MODULE_ORDER: readonly string[] = [
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
    'invoicing',
    'delivery',
    'returns',
    'inventory',
    'webhooks',
    'api-keys'
];

/** A module folder's name. */
type ModuleSection = string;

/** Every module folder that ships its own standalone `openapi.yaml`, discovered from disk. */
const modulesWithOpenapi = (): string[] =>
    readdirSync(path.join(REPO_ROOT, 'src', 'modules'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => existsSync(path.join(REPO_ROOT, 'src', 'modules', name, 'openapi.yaml')));

/** The modules contributing a standalone document, in the order the contract is assembled in. */
export const MODULE_SECTIONS: readonly ModuleSection[] = orderSections(
    MODULE_ORDER,
    modulesWithOpenapi()
);

/**
 * Every section a path can be filed under: the modules, plus the shell.
 *
 * `system` owns no folder — `GET /` is the application answering for itself, so it is written into
 * the root document rather than into a module. It is still a section for anything that groups paths
 * by owner, which is why the client collections show a System folder.
 */
export const SECTION_ORDER: readonly SectionName[] = ['system', ...MODULE_SECTIONS];

export type SectionName = string;

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

/** One error code's declaration, as a fragment's `x-error-codes` map holds it (CT-D5). */
interface ErrorCodeEntry {
    status: number;
    description: string;
}

/** The shape this step reads out of the bundled document, and writes back into. */
interface BundledDocument {
    'x-app-level-responses'?: Record<string, AppLevelResponse>;
    'x-error-codes'?: Record<string, ErrorCodeEntry>;
    paths?: Record<string, Record<string, unknown>>;
    /** Only checked for presence — a sanity guard that the bundle still has the schema this catalogue documents. */
    components?: { schemas?: { ErrorItem?: unknown } };
}

/**
 * Narrows a path-item entry to the fields this step reads. Only the keys in
 * {@link OPERATION_METHODS} are ever passed in, so all this rejects is a method the path item
 * does not declare.
 */
const isOperation = (value: unknown): value is Operation =>
    typeof value === 'object' && value !== null;

/**
 * Narrows what `yaml`'s `parse` hands back — typed `unknown` since it accepts arbitrary YAML —
 * to the shape this step reads. A malformed bundle (not an object at all) fails here with a
 * clear message rather than surfacing as a `TypeError` several calls downstream.
 */
const isBundledDocument = (value: unknown): value is BundledDocument =>
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
    // `yaml`: parse the bundled document into a plain object graph.
    // https://eemeli.org/yaml/#parse-yaml-to-json-value
    const parsed: unknown = parseYaml(bundled);
    if (!isBundledDocument(parsed))
        throw new Error('[openapi] the bundled document did not parse to an object.');

    const document_ = parsed;
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

/** The methods an `x-versioned` marker may name: reads that hand out an `ETag`, writes that take `If-Match`. */
const VERSIONED_READ_METHODS = new Set(['get']);
const VERSIONED_WRITE_METHODS = new Set(['put', 'patch', 'delete']);

/** As much of a versioned path item as {@link withVersionedResources} reads. */
type VersionedPathItem = Record<string, unknown> & { 'x-versioned'?: string[] };

/**
 * Adds the `ETag` header to an operation's inline `200`. A `200` that is a `$ref` cannot take one
 * — a sibling of `$ref` is ignored — so it is refused loudly rather than left silently bare.
 */
const withEtagHeader = (operation: Operation, where: string): void => {
    const ok = operation.responses?.['200'];
    if (typeof ok !== 'object' || ok === null || '$ref' in ok)
        throw new Error(
            `[openapi] ${where}: an \`x-versioned\` operation needs an inline 200 to hang \`ETag\` on, not a $ref.`
        );
    Object.assign(ok, { headers: { ETag: { $ref: '#/components/headers/ETag' } } });
};

/**
 * Adds the `If-Match` parameter and the `412` to a write operation, leaving anything the
 * operation already declares for itself.
 */
const withIfMatch = (operation: Operation): void => {
    const withParameters = operation as Operation & { parameters?: unknown[] };
    withParameters.parameters = [
        ...(withParameters.parameters ?? []),
        { $ref: '#/components/parameters/IfMatchHeader' }
    ];
    operation.responses = {
        '412': { $ref: '#/components/responses/PreconditionFailed' },
        ...operation.responses
    };
};

/**
 * Apply every path item's `x-versioned: [methods]` marker: `ETag` on the listed reads and on the
 * listed `put`/`patch` `200`s, and `If-Match` plus `412` on the listed writes.
 *
 * Runs on the bundled document for the same reason {@link withAppLevelResponses} does, and the
 * marker STAYS in the published contract — it is the machine-readable list of which resources
 * are versioned, which the contract tests walk.
 *
 * @throws Error if a marker names a method the path item does not declare, or one that is neither read nor write
 */
export const withVersionedResources = (bundled: string): string => {
    const parsed: unknown = parseYaml(bundled);
    if (!isBundledDocument(parsed))
        throw new Error('[openapi] the bundled document did not parse to an object.');

    for (const [route, item] of Object.entries(parsed.paths ?? {})) {
        const methods = (item as VersionedPathItem)['x-versioned'];
        for (const method of methods ?? []) {
            const operation = item[method];
            if (!isOperation(operation))
                throw new Error(
                    `[openapi] ${route}: x-versioned names ${method}, which it does not declare.`
                );
            if (VERSIONED_READ_METHODS.has(method)) withEtagHeader(operation, `${method} ${route}`);
            else if (VERSIONED_WRITE_METHODS.has(method)) withIfMatch(operation);
            else throw new Error(`[openapi] ${route}: x-versioned cannot name ${method}.`);
            if (method === 'put' || method === 'patch')
                withEtagHeader(operation, `${method} ${route}`);
        }
    }

    return stringifyYaml(parsed, { lineWidth: 0 });
};

/** Narrows a fragment's `x-error-codes` entry to the shape this step requires. */
const isErrorCodeEntry = (value: unknown): value is ErrorCodeEntry =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { status?: unknown }).status === 'number' &&
    typeof (value as { description?: unknown }).description === 'string';

/** A fragment's own `x-error-codes:` map, or none if it declares no error codes at all. */
interface FragmentWithErrorCodes {
    'x-error-codes'?: Record<string, unknown>;
}

/**
 * Every error code the contract declares, collected straight off the root and every module
 * fragment's OWN file — never through `redocly bundle`, which only resolves `$ref` chains
 * reachable from the root's `paths`/`components` and has no way to see a top-level key nothing
 * ever points at. The same reason {@link moduleOfPath} reads `sectionPaths` off disk instead.
 *
 * @throws Error if two fragments declare the same code, or an entry is missing its status or description
 */
const collectErrorCodes = (): Record<string, ErrorCodeEntry> => {
    const collected: Record<string, ErrorCodeEntry> = {};

    const collectFrom = (file: string, owner: string): void => {
        const parsed = parseYaml(readFileSync(file, 'utf8')) as FragmentWithErrorCodes;
        for (const [code, entry] of Object.entries(parsed['x-error-codes'] ?? {})) {
            if (!isErrorCodeEntry(entry))
                throw new Error(
                    `[openapi] ${owner}'s x-error-codes.${code} needs a numeric status and a string description.`
                );
            if (Object.hasOwn(collected, code))
                throw new Error(
                    `[openapi] two fragments declare the error code ${code} — the second is ${owner}.`
                );
            collected[code] = entry;
        }
    };

    collectFrom(ROOT_SPEC, 'the root');
    for (const section of MODULE_SECTIONS) collectFrom(moduleSpec(section), section);

    return collected;
};

/**
 * Publishes the collected error-code catalogue as the bundled document's own `x-error-codes` —
 * `ErrorItem.code` itself stays `type: string` with its one illustrative `example`, deliberately
 * NEVER an `enum`, which could never gain a code later without being a breaking response change
 * (Zalando API guideline #112, CT-D5). OpenAPI 3.0 (this contract's version) has no schema-level
 * `examples` LIST the way 3.1 does — `oas3-schema` refuses one — so the full, documented set lives
 * in this vendor extension instead, which also carries each code's status and description,
 * strictly more than a bare list of names would.
 *
 * Unlike {@link withAppLevelResponses}'s instruction key, `x-error-codes` is NOT deleted once
 * applied: it is real documentation a published contract benefits from keeping, and the generated
 * TypeScript catalogue (`npm run gen:api`) reads it straight off this file.
 *
 * @throws Error if the bundle has no `components.schemas.ErrorItem` to publish alongside
 */
export const withErrorCodes = (
    bundled: string,
    errorCodes: Record<string, ErrorCodeEntry>
): string => {
    const parsed: unknown = parseYaml(bundled);
    if (!isBundledDocument(parsed))
        throw new Error('[openapi] the bundled document did not parse to an object.');

    const document_ = parsed;
    if (!document_.components?.schemas?.ErrorItem)
        throw new Error(
            '[openapi] the bundled document has no components.schemas.ErrorItem to publish x-error-codes alongside.'
        );

    const codes = Object.keys(errorCodes).toSorted();
    document_['x-error-codes'] = Object.fromEntries(codes.map((code) => [code, errorCodes[code]]));

    return stringifyYaml(document_, { lineWidth: 0 });
};

/** Every documented path, mapped to the module fragment that declared it. A `system` path is absent — it is written into the root document directly, so it belongs to no module. */
const moduleOfPath = (): Record<string, string> => {
    const map: Record<string, string> = {};
    for (const section of MODULE_SECTIONS)
        for (const path of sectionPaths(section)) map[path] = section;
    return map;
};

/**
 * Stamps `x-module: <fragment directory>` on every operation a path maps to a module — the
 * contract-side answer to which module owns an operation, derived from the same per-module
 * fragment files the bundle is assembled from rather than written by hand per operation.
 *
 * Takes the map as a parameter instead of reading disk itself, the same split
 * {@link withAppLevelResponses} keeps between the merge RULE and the data it runs against — this
 * lets a test drive it with a small map rather than the whole contract.
 *
 * @param bundled - the bundled OpenAPI document, as YAML text
 * @param moduleByPath - which module fragment declared each documented path — see {@link moduleOfPath}
 * @throws Error if the bundled document does not parse to an object
 */
export const withModuleStamps = (bundled: string, moduleByPath: Record<string, string>): string => {
    // `yaml`: parse the bundled document into a plain object graph.
    // https://eemeli.org/yaml/#parse-yaml-to-json-value
    const parsed: unknown = parseYaml(bundled);
    if (!isBundledDocument(parsed))
        throw new Error('[openapi] the bundled document did not parse to an object.');

    const document_ = parsed;

    for (const [path, pathItem] of Object.entries(document_.paths ?? {})) {
        // `Object.hasOwn`, not a nullish check on the value: `Record<string, string>` promises a
        // value for every key, so an index access reads as always-present to TypeScript even
        // though a `system` path is never in this map at all — see `moduleOfPath`.
        if (!Object.hasOwn(moduleByPath, path)) continue;
        const moduleName = moduleByPath[path];

        for (const method of OPERATION_METHODS) {
            const operation = pathItem[method];
            if (isOperation(operation))
                (operation as Record<string, unknown>)['x-module'] = moduleName;
        }
    }

    return stringifyYaml(document_, { lineWidth: 0 });
};

/** Where the completed contract tree is staged for one bundle run. Under gitignored `tmp/`. */
const STAGING_DIR = path.join(REPO_ROOT, 'tmp', 'contracts', 'openapi-tree');

/**
 * Lays out a scratch copy of the contract's authored files with the root completed from the
 * fragments ({@link assembleRoot}), and returns the completed root's path.
 *
 * A COPY OF THE WHOLE TREE, not one extra file, on purpose: every fragment reaches the root's
 * shared components by a relative `$ref` to `shared/contracts/openapi.root.yaml`. Bundling a
 * completed root that lives anywhere else makes redocly treat it and the real root as two
 * documents, and every shared schema comes out twice (`AccountExportResponse-2`). Staged in the
 * same relative layout, the fragments' refs land on the completed root and there is one.
 */
const stageAssembledTree = (): string => {
    rmSync(STAGING_DIR, { recursive: true, force: true });

    const stagedRoot = path.join(STAGING_DIR, 'shared', 'contracts', 'openapi.root.yaml');
    mkdirSync(path.dirname(stagedRoot), { recursive: true });
    writeFileSync(
        stagedRoot,
        assembleRoot(
            readFileSync(ROOT_SPEC, 'utf8'),
            readModuleFragments(path.join(REPO_ROOT, 'src', 'modules'), MODULE_ORDER)
        )
    );

    for (const section of MODULE_SECTIONS) {
        const target = path.join(STAGING_DIR, 'src', 'modules', section, 'openapi.yaml');
        mkdirSync(path.dirname(target), { recursive: true });
        copyFileSync(moduleSpec(section), target);
    }

    return stagedRoot;
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

    const assembledRoot = stageAssembledTree();

    try {
        execFileSync(
            process.execPath,
            [
                path.join(REPO_ROOT, 'node_modules', '@redocly', 'cli', 'bin', 'cli.js'),
                'bundle',
                assembledRoot,
                '--output',
                temporary
            ],
            { cwd: REPO_ROOT, stdio: ['ignore', 'ignore', 'pipe'] }
        );
    } catch (error) {
        /*
         * Almost always a `$ref` a fragment or the root names and no file answers. Redocly says
         * which line, so let it through verbatim rather than wrapping it in a summary that hides
         * the location.
         */
        const details = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
        throw new Error(`[openapi] redocly bundle failed.\n${details}`, { cause: error });
    } finally {
        rmSync(STAGING_DIR, { recursive: true, force: true });
    }

    /*
     * The marker has to be prepended rather than written into a source, because redocly PARSES: a
     * comment at the top of `openapi.root.yaml` would be dropped like every other one. Two lines of
     * YAML comment ahead of `openapi: 3.0.3` are legal, and spectral, orval and the AsyncAPI-style
     * viewers all read past them — the alternative is the one artefact in the repo that cannot say
     * what it is.
     */
    compiled =
        MARKER +
        withErrorCodes(
            withModuleStamps(
                withVersionedResources(withAppLevelResponses(readFileSync(temporary, 'utf8'))),
                moduleOfPath()
            ),
            collectErrorCodes()
        );
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
