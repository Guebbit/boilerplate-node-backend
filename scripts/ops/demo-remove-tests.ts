/**
 * @module
 * The tests that go with a removed module: every test file that imports one (or says it
 * `requires-module` one), directly or through another test file that does — `demo-remove.ts`'s test step.
 *
 * Why a file can be deleted whole: a test that cannot import its subject cannot run, and a test
 * that only borrowed a removed module as sample data (a product to translate, an order to export)
 * lost the thing it was written to exercise. Foundation tests keep the shop-dependent cases in
 * their own files, so the deletion is exact rather than a loss of the module's other coverage.
 */

import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { RemovalNote } from './demo-remove-registry';

/** Where tests live: the system-level tree, and each surviving module's own `tests/` folder. */
const testRoots = (repoRoot: string): string[] => {
    const modulesDirectory = path.join(repoRoot, 'src', 'modules');
    const moduleTests = existsSync(modulesDirectory)
        ? readdirSync(modulesDirectory, { withFileTypes: true })
              .filter((entry) => entry.isDirectory())
              .map((entry) => path.join(modulesDirectory, entry.name, 'tests'))
        : [];
    return [path.join(repoRoot, 'tests'), ...moduleTests].filter((root) => existsSync(root));
};

/** Every `.ts` file under a directory. */
const walkTypeScript = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return walkTypeScript(full);
        return entry.name.endsWith('.ts') ? [full] : [];
    });

/**
 * A specifier written where code writes one, not inside a string: a statement-leading
 * `import`/`export ... from`, or a `jest.mock()`/`import()`/`require()` call. Anchored to the line
 * start (or to a `from` closing a multi-line import) so a fixture that merely QUOTES an import —
 * an ESLint rule's test input, this script's own tests — is not mistaken for one.
 */
const SPECIFIER_PATTERNS: readonly RegExp[] = [
    /^\s*(?:import|export)\b[^"';]*?\bfrom\s+["']([^"']+)["']/gm,
    /^\s*import\s+["']([^"']+)["']/gm,
    /^[^\n"'`]*\b(?:jest\.(?:mock|requireActual|doMock)|import|require)\(\s*["']([^"']+)["']/gm
];

/**
 * A test that needs a module without importing it — it drives the kernel through the shop's
 * subjects and roles, say — says so on a `// requires-module: a, b` line. Deleting a listed module
 * deletes the file, the same as an import would.
 */
const REQUIRES_MODULE = /^\/\/ requires-module:\s*(.+)$/gm;

/**
 * The module names a file declares it requires.
 * @param source - the file's text
 */
const requiredModules = (source: string): string[] =>
    [...source.matchAll(REQUIRES_MODULE)].flatMap((match) =>
        match[1].split(',').map((name) => name.trim())
    );

/**
 * Every module specifier a file names.
 * @param source - the file's text
 */
const specifiersOf = (source: string): string[] =>
    SPECIFIER_PATTERNS.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]));

/**
 * The absolute path a specifier points at, or `undefined` for a package. Handles the three
 * spellings a test uses for repo code: `@modules/<name>/...`, `@tests/...` and a relative path.
 * @param specifier - as written in the import
 * @param importer - the absolute path of the file that wrote it
 * @param repoRoot - repo root
 */
const resolveSpecifier = (
    specifier: string,
    importer: string,
    repoRoot: string
): string | undefined => {
    if (specifier.startsWith('@modules/'))
        return path.join(repoRoot, 'src', 'modules', specifier.slice('@modules/'.length));
    if (specifier.startsWith('@tests/'))
        return path.join(repoRoot, 'tests', 'support', specifier.slice('@tests/'.length));
    if (specifier.startsWith('.')) return path.resolve(path.dirname(importer), specifier);
    return undefined;
};

/** Whether a resolved path sits inside (or is) one of the removed module folders or deleted files. */
const isGone = (resolved: string, gone: readonly string[]): boolean =>
    gone.some(
        (target) =>
            resolved === target ||
            resolved.startsWith(`${target}${path.sep}`) ||
            resolved.startsWith(`${target}.`)
    );

/**
 * Delete every test that imports a removed module, then every test that imports one of those, until
 * nothing new falls out.
 * @param repoRoot - repo root
 * @param names - the removed module names (their folders are already deleted)
 * @returns one note per deleted file
 */
export const removeResidueTests = (repoRoot: string, names: readonly string[]): RemovalNote[] => {
    const files = testRoots(repoRoot).flatMap((root) => walkTypeScript(root));
    const gone = names.map((name) => path.join(repoRoot, 'src', 'modules', name));
    const deleted: string[] = [];

    for (let changed = true; changed; ) {
        changed = false;
        for (const file of files.filter((candidate) => !deleted.includes(candidate))) {
            const source = readFileSync(file, 'utf8');
            const importsGone = specifiersOf(source).some((specifier) => {
                const resolved = resolveSpecifier(specifier, file, repoRoot);
                return resolved !== undefined && isGone(resolved, gone);
            });
            const requiresGone = requiredModules(source).some((name) => names.includes(name));
            if (!importsGone && !requiresGone) continue;
            deleted.push(file);
            gone.push(file.replace(/\.ts$/, ''));
            changed = true;
        }
    }

    for (const file of deleted) unlinkSync(file);
    return deleted.map((file) => ({
        file: path.relative(repoRoot, file),
        detail: 'deleted — imports or requires a removed module'
    }));
};
