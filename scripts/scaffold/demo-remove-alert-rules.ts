/**
 * @module
 * The Prometheus alert rules that watch a removed module's own metric, and their `promtool` cases:
 * `docker/observability/prometheus.alert-rules.yaml` and its `.test.yaml`.
 *
 * A rule names a metric, never a module, so the owner is read off the code: a metric is the
 * removed modules' when only their folders register it. That read happens BEFORE the folders go
 * ({@link readRemovedMetrics}), in the same order `demo-remove-authorization.ts` keeps.
 *
 * Text edits, not a YAML round trip: a re-stringify would re-wrap every description.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RemovalNote } from './demo-remove-registry';

/** The rule file, relative to the repo root. */
const RULES = path.join('docker', 'observability', 'prometheus.alert-rules.yaml');

/** Its `promtool test rules` cases. */
const RULE_TESTS = path.join('docker', 'observability', 'prometheus.alert-rules.test.yaml');

/**
 * A metric registered by name, `name: 'payment_amount_mismatch_total'` — the same read as
 * `tests/cross-cutting/alert-rules-metrics.test.ts`. The underscore keeps out the other `name:`
 * literals a module writes (its own name, a queue's).
 */
const METRIC_NAME = /name:\s*'([a-z][a-z0-9]*_[a-z0-9_]+)'/g;

/**
 * Every non-test `.ts` file under a directory.
 * @param directory - absolute path to walk
 */
const sourceFiles = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return entry.name === 'tests' ? [] : sourceFiles(full);
        return entry.name.endsWith('.ts') ? [full] : [];
    });

/**
 * Every metric name a set of files registers.
 * @param files - absolute paths
 */
const metricsIn = (files: readonly string[]): Set<string> =>
    new Set(
        files.flatMap((file) =>
            [...readFileSync(file, 'utf8').matchAll(METRIC_NAME)].map(([, metric]) => metric)
        )
    );

/**
 * The metrics only the modules about to be removed register, read while their folders exist.
 * @param repoRoot - repo root
 * @param names - the modules about to be removed
 */
export const readRemovedMetrics = (
    repoRoot: string,
    names: readonly string[]
): ReadonlySet<string> => {
    const removedRoots = names.map((name) => path.join(repoRoot, 'src', 'modules', name, ''));
    const isRemoved = (file: string): boolean =>
        removedRoots.some((removedRoot) => file.startsWith(removedRoot));
    const files = sourceFiles(path.join(repoRoot, 'src'));

    const surviving = metricsIn(files.filter((file) => !isRemoved(file)));
    return new Set(
        [...metricsIn(files.filter((file) => isRemoved(file)))].filter(
            (metric) => !surviving.has(metric)
        )
    );
};

/**
 * Split a YAML list into its items, each keeping the comment lines directly above it.
 * @param content - the file's text
 * @param keys - the keys that open an item (`alert|name`, `interval`)
 */
const splitItems = (content: string, keys: string): string[] =>
    // Never between a comment and the item it describes: the lookbehind skips a comment line's end.
    content.split(
        new RegExp(
            String.raw`(?<!^[ \t]*#[^\n]*)\n(?=(?:[ \t]*#[^\n]*\n)*[ \t]*- (?:${keys}):)`,
            'm'
        )
    );

/** The alert a rule item declares, or `undefined` for any other chunk. */
const alertOf = (chunk: string): string | undefined => /^[ \t]*- alert:\s*(\w+)/m.exec(chunk)?.[1];

/** Whether a chunk opens a rule group (`- name: business.rules`). */
const isGroup = (chunk: string): boolean => /^[ \t]*- name:/m.test(chunk);

/**
 * Drop every rule that reads one of `metrics`, then any group it left without a rule.
 * @param repoRoot - the checkout to edit
 * @param metrics - the removed modules' metrics
 * @returns the alert names dropped, for {@link stripRuleTests}
 */
const stripRules = (repoRoot: string, metrics: ReadonlySet<string>): string[] => {
    const file = path.join(repoRoot, RULES);
    const reads = (chunk: string): boolean =>
        [...metrics].some((metric) => new RegExp(String.raw`\b${metric}\b`).test(chunk));
    const chunks = splitItems(readFileSync(file, 'utf8'), 'alert|name');

    const dropped = chunks.filter((chunk) => alertOf(chunk) !== undefined && reads(chunk));
    const kept = chunks.filter((chunk) => !dropped.includes(chunk));
    // A group header is followed by its first rule; one followed by anything else is now empty.
    const nonEmpty = kept.filter(
        (chunk, index) => !isGroup(chunk) || alertOf(kept[index + 1] ?? '') !== undefined
    );

    writeFileSync(file, nonEmpty.join('\n'));
    return dropped.map((chunk) => alertOf(chunk) ?? '');
};

/**
 * Drop every `promtool` case that asks about one of `alerts`.
 * @param repoRoot - the checkout to edit
 * @param alerts - the alert names {@link stripRules} dropped
 */
const stripRuleTests = (repoRoot: string, alerts: readonly string[]): void => {
    const file = path.join(repoRoot, RULE_TESTS);
    const asksAboutDropped = (chunk: string): boolean =>
        [...chunk.matchAll(/alertname:\s*(\w+)/g)].some(([, alert]) => alerts.includes(alert));

    writeFileSync(
        file,
        splitItems(readFileSync(file, 'utf8'), 'interval')
            .filter((chunk) => !asksAboutDropped(chunk))
            .join('\n')
    );
};

/**
 * Edit the two rule files: every alert on a removed metric goes, with its test cases.
 * @param repoRoot - the checkout to edit
 * @param metrics - what {@link readRemovedMetrics} found
 */
export const stripAlertRules = (repoRoot: string, metrics: ReadonlySet<string>): RemovalNote[] => {
    if (metrics.size === 0) return [];
    const alerts = stripRules(repoRoot, metrics);
    if (alerts.length === 0) return [];

    stripRuleTests(repoRoot, alerts);
    return [
        { file: RULES, detail: `removed ${alerts.join(', ')}` },
        { file: RULE_TESTS, detail: `removed the cases for ${alerts.join(', ')}` }
    ];
};
