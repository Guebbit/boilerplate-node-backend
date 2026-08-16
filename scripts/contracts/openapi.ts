/**
 * `openapi.yaml` — the REST contract, compiled from one standalone document per module.
 *
 * WHAT A MODULE OWNS. `src/modules/<name>/openapi.yaml` is a complete, valid OpenAPI document: the
 * paths under that module's `basePath`, and the schemas only those paths reference. You can lint
 * one on its own, open one in Swagger Editor, and read one without holding the rest of the contract
 * in your head. Everything two or more modules reference — the error envelope, the pagination
 * parameters, the scalars, the entities a cart line embeds — lives in `openapi.root.yaml`, and a
 * module reaches it by `$ref` across the file boundary rather than by assuming a neighbour's text
 * will be concatenated above its own.
 *
 * WHY REDOCLY AND NOT A CONCATENATOR. This document used to be assembled by pasting verbatim line
 * slices together, because a YAML round trip loses comments and the comments are load-bearing. What
 * changed is where the comments have to survive: in the MODULE files, which are authored, and not
 * in the bundle, which nobody reads by hand. Once that is true, `redocly bundle` does the job the
 * standard way — resolving `$ref` — and the layout becomes one every editor, linter and codegen
 * already understands.
 *
 * THE ANCHORS HAD TO GO. The old fragments shared the success-envelope preamble through YAML
 * anchors (`*envelopeSuccess`), which is why nothing could ever parse them: an anchor cannot cross a
 * file, so a fragment was only valid once pasted. They are named schemas now — `EnvelopeSuccess`,
 * `EnvelopeStatus`, `EnvelopeMessage` — which is the same sharing expressed in a way a `$ref` can
 * reach. `additionalProperties: false` is unaffected: it constrains property NAMES, so a `$ref` at
 * a property's value position is not the `allOf` problem the anchors were avoiding.
 *
 * DELETING A MODULE is `rm -rf` of its folder plus its block in the root's path index. Forgetting
 * the second half is a bundle failure naming the exact line, which is the point — a bundler that
 * quietly dropped a section would fork this repo from the frontend's copy silently.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import path from 'node:path';
import { REPO_ROOT, type CompiledBundle } from './fragments';

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
    'account',
    'users',
    'feedback',
    'products',
    'cart',
    'wishlist',
    'orders',
    'payments',
    'delivery',
    'inventory'
] as const;

export type ModuleSection = (typeof MODULE_SECTIONS)[number];

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
export const ROOT_SPEC = path.join(REPO_ROOT, 'shared', 'contracts', 'openapi.root.yaml');

/** The committed contract every tool reads. */
export const OPENAPI_OUTPUT = path.join(REPO_ROOT, 'openapi.yaml');

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
/** What the committed contract opens with, so the file says what it is. */
const MARKER =
    '# Code generated by `npm run contracts:bundle`. DO NOT EDIT.\n' +
    '# Sources: shared/contracts/openapi.root.yaml and src/modules/*/openapi.yaml\n';

let compiled: string | undefined;

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
    compiled = MARKER + readFileSync(temporary, 'utf8');
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
