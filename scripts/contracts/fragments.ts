/**
 * @module
 * Reading a module's own contract fragments off disk — the one door the build steps use, instead of
 * each declaring a throwaway type for the three keys it happens to look at.
 *
 * Two shapes, because there are two kinds of fragment: a module's `openapi.yaml` and its
 * `authorization.yaml`. Both take a root or a file, never a cache: tests feed scratch trees, and a
 * module-keyed cache would answer for the wrong one.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

/** One entry of a fragment's top-level `tags:`. */
export interface DeclaredTag {
    /** The tag's name, as operations list it. */
    name: string;
    /** The tag's description in the API docs. */
    description?: string;
    /** The API-docs family the tag is listed under (`x-tagGroups`); absent means its module's group. */
    'x-family'?: string;
}

/**
 * The API-docs family a module's tags fall under when a tag names none: by the module's `group`
 * in its `module.yaml`. Also what the scaffolder writes into a new module's own tags.
 */
export const TAG_FAMILY_OF_GROUP: Readonly<Record<string, string>> = {
    foundation: 'Core',
    shop: 'Shop',
    example: 'Example'
};

/** One export section a module declares for `POST /account/export`. */
export interface DeclaredSection {
    /** Whether the section is always part of the export. */
    required?: boolean;
    /** The section's JSON Schema; its shape is checked where it is used. */
    schema?: unknown;
}

/**
 * A module's `openapi.yaml`, as far as the build steps look: every key optional, because a
 * fragment is free to declare any subset of them.
 */
export interface OpenApiFragment {
    /** The tags the module declares. */
    tags?: DeclaredTag[];
    /** Path to verb to operation, reduced to its tags and cache policy. */
    paths?: Record<string, Record<string, { tags?: string[]; 'x-cache'?: string } | undefined>>;
    /** The module's reusable schemas, by name. */
    components?: { schemas?: Record<string, unknown> };
    /** The module's error-code catalogue. */
    'x-error-codes'?: Record<string, unknown>;
    /** The export sections the module contributes, by key. */
    'x-personal-data'?: Record<string, DeclaredSection>;
}

/**
 * Read one OpenAPI-shaped file.
 *
 * @param file - the file's path
 * @returns what it declares; an empty file declares nothing
 */
export const readOpenApiFragment = (file: string): OpenApiFragment =>
    // `yaml`'s YAML 1.2 loader (`null` for an empty file); the `as` narrows its `any`.
    (parseYaml(readFileSync(file, 'utf8')) as OpenApiFragment | null) ?? {};

/**
 * Read a module's `openapi.yaml`.
 *
 * @param modulesRoot - a `src/modules` directory (the real one, or a scratch tree)
 * @param module - the module folder
 */
export const readModuleFragment = (modulesRoot: string, module: string): OpenApiFragment =>
    readOpenApiFragment(path.join(modulesRoot, module, 'openapi.yaml'));

/** One rule an `authorization.yaml` declares — only the fields the build steps read. */
export interface AuthorizationRule {
    /** What the rule lets the holder do (`read`, `update`, ...). */
    action: string;
    /** What it lets them do it to. */
    subject: string;
    /** The module whose file declares it. */
    module: string;
}

/** One permission set an `authorization.yaml` declares — only the fields the build steps read. */
export interface AuthorizationSet {
    /** The set's name. */
    name: string;
    /** The module whose file declares it. */
    module: string;
    /** The rules the set grants, as `action:Subject` keys. */
    rules: string[];
}

/** An `authorization.yaml`, as far as the build steps look. */
export interface AuthorizationFragment {
    /** Every rule the file declares. */
    rules: AuthorizationRule[];
    /** Every permission set the file declares. */
    sets: AuthorizationSet[];
}

/**
 * Read an `authorization.yaml`-shaped file.
 *
 * @param file - the file's path
 * @returns its rules and sets; none when the file is absent, and no sets when it declares none
 */
export const readAuthorizationFragment = (file: string): AuthorizationFragment => {
    if (!existsSync(file)) return { rules: [], sets: [] };
    // `yaml`'s YAML 1.2 loader; the `as` narrows its `any` to the shape every fragment has.
    const parsed = parseYaml(readFileSync(file, 'utf8')) as Partial<AuthorizationFragment>;
    return { rules: parsed.rules ?? [], sets: parsed.sets ?? [] };
};
