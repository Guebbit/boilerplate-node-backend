/**
 * @module
 * The two shared authorization files that name a removed module's permission keys by hand:
 * `shared/authorization-roles.yaml` (every role lists its keys) and
 * `shared/authorization-conformance.yaml` (callers hold keys, cases ask about subjects).
 *
 * The bundle (`shared/authorization-keys.yaml`) drops a module's keys on its own, because it is
 * assembled from the fragments that were deleted with the folder. These two are edited FROM the
 * fragments, so they are read BEFORE the folders go: {@link readRemovedAuthorization}.
 *
 * Text edits, not a YAML round trip: both files are committed byte-for-byte to the PHP twin, and
 * a re-stringify would re-wrap every description.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { RemovalNote } from './demo-remove-registry';

/** What a set of removed modules declared: their permission keys, and the CASL subjects only they used. */
export interface RemovedAuthorization {
    /** Every key the removed modules' fragments declared. */
    keys: ReadonlySet<string>;
    /** Subjects no surviving fragment (or the core one) still declares. */
    subjects: ReadonlySet<string>;
}

/** One key's fields this step reads. */
interface FragmentKey {
    key: string;
    subject: string;
}

/** Keys and subjects one `authorization.yaml`-shaped file declares, or none when it is absent. */
const readFragment = (file: string): FragmentKey[] =>
    existsSync(file) ? (parseYaml(readFileSync(file, 'utf8')) as { keys: FragmentKey[] }).keys : [];

/**
 * Read what the modules about to be removed declare, while their folders still exist.
 * @param repoRoot - repo root
 * @param names - the modules about to be removed
 */
export const readRemovedAuthorization = (
    repoRoot: string,
    names: readonly string[]
): RemovedAuthorization => {
    const modulesRoot = path.join(repoRoot, 'src', 'modules');
    const fragmentOf = (name: string): string => path.join(modulesRoot, name, 'authorization.yaml');
    const survivors = readdirSync(modulesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !names.includes(entry.name))
        .flatMap((entry) => readFragment(fragmentOf(entry.name)));
    const core = readFragment(
        path.join(repoRoot, 'shared', 'contracts', 'authorization-keys.core.yaml')
    );
    const removed = names.flatMap((name) => readFragment(fragmentOf(name)));

    const stillUsed = new Set([...survivors, ...core].map((entry) => entry.subject));
    return {
        keys: new Set(removed.map((entry) => entry.key)),
        subjects: new Set(
            removed.map((entry) => entry.subject).filter((subject) => !stillUsed.has(subject))
        )
    };
};

/** A list item naming exactly one key: `    - orders.any.read`. */
const KEY_LINE = /^\s*-\s+([\w.-]+)\s*$/;

/**
 * Drop each removed key's list item from `shared/authorization-roles.yaml`; a role left with no
 * key at all keeps an explicit empty list so the file still parses.
 */
export const stripRoleGrants = (repoRoot: string, removed: RemovedAuthorization): RemovalNote => {
    const file = path.join(repoRoot, 'shared', 'authorization-roles.yaml');
    const lines = readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => !removed.keys.has(KEY_LINE.exec(line)?.[1] ?? ''));

    const out = lines.map((line, index) => {
        const emptied = /^(\s*)permissions:(?: &\w+)?\s*$/.exec(line);
        // Comments may sit between the heading and its first item; only a real line decides.
        const next = lines.slice(index + 1).find((each) => !/^\s*(?:#.*)?$/.test(each)) ?? '';
        return emptied && !KEY_LINE.test(next) ? line.replace(/\s*$/, ' []') : line;
    });
    writeFileSync(file, out.join('\n'));
    return {
        file: 'shared/authorization-roles.yaml',
        detail: 'removed the removed modules’ grants'
    };
};

/** Every `- name:` case block, with the comment lines above it, as one chunk of text. */
const splitCases = (cases: string): string[] => cases.split(/\n(?=\s*(?:#[^\n]*\n\s*)*- name:)/);

/** Inline `permissions: [...]` lists in a chunk, as their raw inner text. */
const INLINE_PERMISSIONS = /permissions:\s*\[([^\]]*)]/g;

/**
 * Prune one case chunk: `undefined` when the case is about a removed subject or was left holding
 * no key at all (a deny that would now pass for the wrong reason), else the chunk minus the
 * removed keys.
 */
const pruneCase = (chunk: string, removed: RemovedAuthorization): string | undefined => {
    const subject = /^\s*subject:\s*(\w+)/m.exec(chunk)?.[1];
    if (subject !== undefined && removed.subjects.has(subject)) return undefined;

    const lists = [...chunk.matchAll(INLINE_PERMISSIONS)].map((match) =>
        match[1]
            .split(',')
            .map((key) => key.trim())
            .filter(Boolean)
    );
    const emptied = lists.some(
        (all) => all.length > 0 && all.every((key) => removed.keys.has(key))
    );
    if (emptied) return undefined;

    return chunk.replaceAll(INLINE_PERMISSIONS, (_whole, inner: string) => {
        const kept = inner
            .split(',')
            .map((key) => key.trim())
            .filter((key) => key !== '' && !removed.keys.has(key));
        return `permissions: [${kept.join(', ')}]`;
    });
};

/**
 * Edit `shared/authorization-conformance.yaml`: drop the shared admin key list's removed keys,
 * every case about a removed subject, and every case whose caller held only removed keys.
 */
export const stripConformanceCases = (
    repoRoot: string,
    removed: RemovedAuthorization
): RemovalNote => {
    const file = path.join(repoRoot, 'shared', 'authorization-conformance.yaml');
    const content = readFileSync(file, 'utf8');
    const [head, cases] = content.split(/^cases:\n/m, 2);

    const headKept = head
        .split('\n')
        .filter((line) => !removed.keys.has(KEY_LINE.exec(line)?.[1] ?? ''))
        .join('\n');
    const casesKept = splitCases(cases)
        .map((chunk) => pruneCase(chunk, removed))
        .filter((chunk): chunk is string => chunk !== undefined)
        .join('\n');

    writeFileSync(file, `${headKept}cases:\n${casesKept}`);
    return {
        file: 'shared/authorization-conformance.yaml',
        detail: 'removed the removed modules’ cases'
    };
};
