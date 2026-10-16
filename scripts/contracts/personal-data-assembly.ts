/**
 * @module
 * The data export's schema, assembled from what each module declares about its own section.
 *
 * A module that contributes to `POST /account/export` says so in its own `openapi.yaml`:
 *
 *     x-personal-data:
 *         <section>:
 *             required: false        # optional; defaults to true
 *             schema: { ... }        # the section's shape, refs relative to the module's file
 *
 * `account/openapi.yaml` keeps only a stub of `AccountExportResponse` (`exportedAt`, `profile`);
 * this step adds one property per declared section to the staged copy of that stub. Removing a
 * module therefore removes its section, with no hand list anywhere.
 *
 * Pure: takes text and declarations, returns text. The caller owns the disk.
 *
 * See: docs/api/contract-fragmentation.md
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isMap, isSeq, parseDocument } from 'yaml';
import { readModuleFragment } from './fragments';

/** The module that owns the export endpoint, and with it the stub being completed. */
const EXPORT_OWNER = 'account';

/** The schema the stub is called in the owner's `components.schemas`. */
const EXPORT_SCHEMA = 'AccountExportResponse';

/** One section of the export, as its owning module declares it. */
export interface PersonalDataSection {
    /** The module folder that declared it. */
    module: string;
    /** The property name in the export document. */
    key: string;
    /** Whether the export always carries it. */
    required: boolean;
    /** The section's schema, with `$ref`s still relative to the declaring module's file. */
    schema: unknown;
}

/**
 * Rewrites every in-file `$ref` (`#/...`) to point at the declaring module's file, so the schema
 * still resolves once it is copied into the owner's document. Cross-file refs are left alone:
 * every fragment sits at the same depth, so a relative path means the same thing from both.
 */
const retarget = (node: unknown, module: string): unknown => {
    if (Array.isArray(node)) return node.map((item) => retarget(item, module));
    if (typeof node !== 'object' || node === null) return node;

    return Object.fromEntries(
        Object.entries(node).map(([key, value]) => [
            key,
            key === '$ref' && typeof value === 'string' && value.startsWith('#/')
                ? `../${module}/openapi.yaml${value}`
                : retarget(value, module)
        ])
    );
};

/**
 * Every export section the modules under `modulesRoot` declare, in the order of `modules`.
 *
 * Read off disk rather than through `redocly bundle`, which only follows `$ref` chains and has no
 * way to see a top-level key nothing points at (the same reason error codes are collected this way).
 *
 * @param modulesRoot - the `src/modules` directory
 * @param modules - the module folders to read, in the order their sections should appear
 */
export const readPersonalDataSections = (
    modulesRoot: string,
    modules: readonly string[]
): PersonalDataSection[] =>
    modules.flatMap((module) => {
        if (!existsSync(path.join(modulesRoot, module, 'openapi.yaml'))) return [];
        const parsed = readModuleFragment(modulesRoot, module);

        return Object.entries(parsed['x-personal-data'] ?? {}).map(([key, declared]) => ({
            module,
            key,
            required: declared.required ?? true,
            schema: retarget(declared.schema, module)
        }));
    });

/**
 * The owner's document with one property per declared section added to the export stub.
 *
 * @param ownerText - `src/modules/account/openapi.yaml`, verbatim
 * @param sections - what the modules declare, in the order they should appear
 * @returns the YAML to stage in place of the owner's file
 * @throws Error when two modules declare the same key, or the stub is missing or malformed
 */
export const assemblePersonalData = (
    ownerText: string,
    sections: readonly PersonalDataSection[]
): string => {
    const document = parseDocument(ownerText);
    const stub = document.getIn(['components', 'schemas', EXPORT_SCHEMA], true);
    if (!isMap(stub)) throw new Error(`[openapi] ${EXPORT_OWNER} declares no ${EXPORT_SCHEMA}.`);
    const properties = stub.get('properties', true);
    const required = stub.get('required', true);
    if (!isMap(properties) || !isSeq(required))
        throw new Error(`[openapi] ${EXPORT_SCHEMA} needs \`properties\` and \`required\`.`);

    for (const { module, key, required: isRequired, schema } of sections) {
        if (properties.has(key))
            throw new Error(
                `[openapi] export section "${key}" is declared twice — the second is ${module}.`
            );
        properties.set(key, document.createNode(schema));
        if (isRequired) required.add(document.createNode(key));
    }

    return document.toString({ lineWidth: 0, indent: 4 });
};

/**
 * Completes the export stub in a staged copy of the module tree, in place.
 *
 * The one call the OpenAPI bundler makes: the declarations are read from the real modules, the
 * stub is rewritten in the staged copy. A tree without the owner has no export endpoint, so
 * there is nothing to complete.
 *
 * @param stagedModulesRoot - the staged `src/modules` directory, fragments already copied in
 * @param modulesRoot - the real `src/modules` directory
 * @param modules - the module folders that ship a contract, in section order
 */
export const stageExportSchema = (
    stagedModulesRoot: string,
    modulesRoot: string,
    modules: readonly string[]
): void => {
    const staged = path.join(stagedModulesRoot, EXPORT_OWNER, 'openapi.yaml');
    if (!existsSync(staged)) return;

    writeFileSync(
        staged,
        assemblePersonalData(
            readFileSync(staged, 'utf8'),
            readPersonalDataSections(modulesRoot, modules)
        )
    );
};
