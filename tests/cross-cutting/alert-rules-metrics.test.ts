/**
 * Every metric an alert rule reads is one the code registers.
 *
 * An alert on a misspelled or renamed metric is the quietest failure there is: the expression
 * evaluates to an empty vector, the alert never fires, and nothing anywhere says so. Prometheus
 * itself cannot tell "no such metric" from "nothing happened".
 *
 * Reads the rule file as text and the metric sources as text, so no process boots. Only
 * `*_total` counters are checked: the rules also read `up`, `http_*` and `nodejs_*`, which come
 * from Prometheus and prom-client's own collectors rather than a `name:` literal in this repo.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const ROOT = path.join(__dirname, '..', '..');

/** The shape of the rule file this test reads: groups of rules with an `expr`. */
interface RuleFile {
    groups: { name: string; rules: { alert: string; expr: string }[] }[];
}

/**
 * Every `.ts` file under a directory, recursively.
 *
 * @param directory - absolute path to walk
 */
const sourceFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
        const full = path.join(directory, entry);
        if (statSync(full).isDirectory()) return entry === 'tests' ? [] : sourceFiles(full);
        return full.endsWith('.ts') ? [full] : [];
    });

const rules = parse(
    readFileSync(path.join(ROOT, 'docker', 'observability', 'prometheus.alert-rules.yaml'), 'utf8')
) as RuleFile;

/** Every `name: '<metric>'` literal a counter or gauge is registered under. */
const registered = new Set(
    sourceFiles(path.join(ROOT, 'src')).flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(/name:\s*'([a-z][a-z0-9_]*)'/g)].map(
            ([, name]) => name
        )
    )
);

/** Every `*_total` counter the rules read, with the alert that reads it. */
const readByRules = rules.groups.flatMap(({ rules: groupRules }) =>
    groupRules.flatMap(({ alert, expr }) =>
        [...expr.matchAll(/\b([a-z][a-z0-9_]*_total)\b/g)].map(([, metric]) => ({ alert, metric }))
    )
);

describe('alert rules and the metrics behind them', () => {
    it('read some counters at all, rather than checking an empty list', () => {
        expect(readByRules.length).toBeGreaterThan(10);
        expect(registered.size).toBeGreaterThan(30);
    });

    it.each(readByRules.map(({ alert, metric }) => [alert, metric]))(
        '%s reads %s, which the code registers',
        (_alert, metric) => {
            expect(registered.has(metric)).toBe(true);
        }
    );
});
