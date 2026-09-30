/**
 * @module
 * The I/O half of the scaffolder: refuse when the module already exists, collect the schema names
 * already taken, then write the planned files and the registry lines. Everything decided lives in
 * the pure files beside it; this one only touches the disk, under a `root` it is given so a test
 * can point it at a scratch directory.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ScaffoldOptions } from './options';
import { collidingSchemas, planModule, type ScaffoldPlan } from './plan';
import { centralEdits } from './central-edits';
import type { FormatText } from './format-text';
import { isRegistered } from './registry';

/** Where the registry sits, relative to a repo root. */
const REGISTRY = 'src/modules.ts';

/** The shape this reader takes from a contract fragment: only its schema names. */
interface FragmentShape {
    components?: { schemas?: Record<string, unknown> };
}

/**
 * Every schema name any module's contract fragment declares.
 * @param root - the repo root
 * @returns the names, so a scaffold cannot redeclare one
 */
const takenSchemaNames = (root: string): Set<string> => {
    const modules = path.join(root, 'src/modules');
    const names = readdirSync(modules)
        .map((folder) => path.join(modules, folder, 'openapi.yaml'))
        .filter((file) => existsSync(file))
        .flatMap((file) => {
            const document = parseYaml(readFileSync(file, 'utf8')) as FragmentShape | null;
            return Object.keys(document?.components?.schemas ?? {});
        });
    return new Set(names);
};

/**
 * The reasons this scaffold cannot go ahead, or an empty list.
 * @param root - the repo root
 * @param plan - the planned files and names
 * @returns human-readable refusals
 */
export const refusalsFor = (root: string, plan: ScaffoldPlan): string[] => {
    const { names } = plan;
    const problems: string[] = [];

    if (existsSync(path.join(root, 'src/modules', names.kebab)))
        problems.push(`src/modules/${names.kebab}/ already exists.`);
    if (existsSync(path.join(root, 'docs/modules', `${names.kebab}.md`)))
        problems.push(`docs/modules/${names.kebab}.md already exists.`);
    if (isRegistered(readFileSync(path.join(root, REGISTRY), 'utf8'), names.kebab))
        problems.push(`${names.kebab} is already registered in ${REGISTRY}.`);

    const clash = collidingSchemas(names, takenSchemaNames(root));
    if (clash.length > 0)
        problems.push(
            `Schema name(s) ${clash.join(', ')} already exist in another module's contract. ` +
                'Pass --entity <Name> to pick a different record type name.'
        );

    return problems;
};

/**
 * Write one planned file, creating its folder.
 * @param root - the repo root
 * @param relative - the repo-relative path
 * @param content - the unformatted content
 */
const writePlanned = async (
    root: string,
    relative: string,
    content: string,
    formatText: FormatText
): Promise<void> => {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, await formatText(root, file, content));
};

/**
 * Scaffold a module under `root`: refuse first, write nothing on a refusal.
 * @param root - the repo root (a scratch copy in tests)
 * @param options - the parsed options
 * @param formatText - how text is formatted before it is written; required, not defaulted, so this
 *   file never loads Prettier itself and a test passes an identity
 * @returns the plan that was written
 * @throws {Error} when the module cannot be scaffolded, listing every reason
 */
export const applyScaffold = async (
    root: string,
    options: ScaffoldOptions,
    formatText: FormatText
): Promise<ScaffoldPlan> => {
    const plan = planModule(options);
    const problems = refusalsFor(root, plan);
    if (problems.length > 0) throw new Error(problems.join('\n'));

    // Every edit is computed before any write: a file that changed shape must leave the tree
    // untouched, not half-scaffolded.
    const edits = await Promise.all(
        centralEdits(plan.names).map(async (edit) => {
            const file = path.join(root, edit.path);
            return {
                file,
                content: await formatText(root, file, edit.apply(readFileSync(file, 'utf8')))
            };
        })
    );

    for (const file of plan.files) await writePlanned(root, file.path, file.content, formatText);
    for (const edit of edits) writeFileSync(edit.file, edit.content);
    return plan;
};
