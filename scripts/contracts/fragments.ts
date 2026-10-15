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
    name: string;
    description?: string;
}

/** One export section a module declares for `POST /account/export`. */
export interface DeclaredSection {
    required?: boolean;
    schema?: unknown;
}

/**
 * A module's `openapi.yaml`, as far as the build steps look: every key optional, because a
 * fragment is free to declare any subset of them.
 */
export interface OpenApiFragment {
    tags?: DeclaredTag[];
    paths?: Record<string, Record<string, { tags?: string[] } | undefined>>;
    components?: { schemas?: Record<string, unknown> };
    'x-error-codes'?: Record<string, unknown>;
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

/** One key an `authorization.yaml` declares — only the fields the build steps read. */
export interface AuthorizationKey {
    key: string;
    subject: string;
    module: string;
}

/** An `authorization.yaml`, as far as the build steps look. */
export interface AuthorizationFragment {
    keys: AuthorizationKey[];
}

/**
 * Read an `authorization.yaml`-shaped file.
 *
 * @param file - the file's path
 * @returns its keys; none when the file is absent
 */
export const readAuthorizationFragment = (file: string): AuthorizationFragment =>
    existsSync(file)
        ? // `yaml`'s YAML 1.2 loader; the `as` narrows its `any` to the shape every fragment has.
          (parseYaml(readFileSync(file, 'utf8')) as AuthorizationFragment)
        : { keys: [] };
