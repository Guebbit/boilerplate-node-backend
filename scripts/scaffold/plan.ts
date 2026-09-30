/**
 * @module
 * What scaffolding a module writes, as data: a list of files (repo-relative path, content). Pure,
 * so a unit test can assert the plan without touching a disk, and the CLI is left with only the
 * refusal check, the writes and the process calls.
 */

import { deriveNames, type ModuleNames } from './names';
import type { ScaffoldOptions } from './options';
import * as code from './templates-code';
import { openapiFragment } from './templates-contract';
import * as documentation from './templates-documentation-tests';

/** One file the scaffolder will create. */
export interface PlannedFile {
    /** Repo-relative path, forward slashes. */
    path: string;
    /** The unformatted content; the CLI runs Prettier over it before writing. */
    content: string;
}

/** The whole plan for one module. */
export interface ScaffoldPlan {
    /** The module's spellings. */
    names: ModuleNames;
    /** Every file to create. */
    files: PlannedFile[];
}

/**
 * The files every scaffolded module gets, whatever its options.
 * @param names - the module's spellings
 * @param options - the scaffold options
 * @returns the planned files
 */
const runtimeFiles = (names: ModuleNames, options: ScaffoldOptions): PlannedFile[] => {
    const root = `src/modules/${names.kebab}`;
    return [
        { path: `${root}/module.yaml`, content: code.moduleYaml(options) },
        { path: `${root}/module.ts`, content: code.moduleManifest(names) },
        { path: `${root}/index.ts`, content: code.barrel(names) },
        { path: `${root}/model.ts`, content: code.modelFile(names) },
        { path: `${root}/repository.ts`, content: code.repositoryFile(names) },
        { path: `${root}/service.ts`, content: code.serviceFile(names, options) },
        { path: `${root}/presenter.ts`, content: code.presenterFile(names) },
        { path: `${root}/routes.ts`, content: code.routesFile(names) },
        { path: `${root}/factories.ts`, content: code.factoriesFile(names) },
        {
            path: `${root}/controllers/get-${names.kebab}.ts`,
            content: code.getController(names, options)
        },
        {
            path: `${root}/controllers/post-${names.kebab}.ts`,
            content: code.postController(names, options)
        },
        {
            path: `${root}/controllers/update-${names.kebab}.ts`,
            content: code.updateController(names, options)
        },
        {
            path: `${root}/controllers/delete-${names.kebab}.ts`,
            content: code.deleteController(names, options)
        }
    ];
};

/**
 * The contract, permission and (optionally) audit files: everything a leaf generator reads.
 * @param names - the module's spellings
 * @param options - the scaffold options
 * @returns the planned files
 */
const declarationFiles = (names: ModuleNames, options: ScaffoldOptions): PlannedFile[] => {
    const root = `src/modules/${names.kebab}`;
    return [
        { path: `${root}/openapi.yaml`, content: openapiFragment(names) },
        { path: `${root}/authorization.yaml`, content: code.authorizationYaml(names) },
        ...(options.audit ? [{ path: `${root}/audit.ts`, content: code.auditFile(names) }] : [])
    ];
};

/**
 * The smoke tests and the docs page.
 * @param names - the module's spellings
 * @param options - the scaffold options
 * @returns the planned files
 */
const testAndDocumentFiles = (names: ModuleNames, options: ScaffoldOptions): PlannedFile[] => {
    const tests = `src/modules/${names.kebab}/tests`;
    return [
        { path: `${tests}/unit/routes.test.ts`, content: documentation.routesTest(names) },
        { path: `${tests}/unit/factories.test.ts`, content: documentation.factoriesTest(names) },
        { path: `${tests}/integration/service.test.ts`, content: documentation.serviceTest(names) },
        {
            path: `docs/modules/${names.kebab}.md`,
            content: documentation.documentationPage(names, options)
        }
    ];
};

/**
 * Plan a module: every file it needs, and none of the central edits (those are
 * `registerModule`'s).
 * @param options - the parsed options
 * @returns the names and the files
 */
export const planModule = (options: ScaffoldOptions): ScaffoldPlan => {
    const names = deriveNames(options.name, options.entity);
    return {
        names,
        files: [
            ...runtimeFiles(names, options),
            ...declarationFiles(names, options),
            ...testAndDocumentFiles(names, options)
        ]
    };
};

/**
 * Names in the plan that the repo's existing contract already uses, so a scaffold that would
 * redeclare a schema (`User`, say) is refused before any file is written.
 * @param names - the module's spellings
 * @param taken - every schema name declared in an existing contract fragment
 * @returns the colliding schema names, empty when the plan is safe
 */
export const collidingSchemas = (names: ModuleNames, taken: ReadonlySet<string>): string[] =>
    [
        names.entity,
        `${names.entity}Envelope`,
        `${names.plural}Response`,
        `${names.plural}ResponseEnvelope`,
        `Create${names.entity}Request`,
        `Replace${names.entity}Request`,
        `Update${names.entity}Request`
    ].filter((schema) => taken.has(schema));
