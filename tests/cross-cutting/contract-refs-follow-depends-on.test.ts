/**
 * A module's contract `$ref`s only a sibling it declares in `module.yaml` `dependsOn`.
 *
 * Why: deleting a module is `rm -rf` of its folder. A `$ref` into a sibling that is not a declared
 * dependency is a coupling the dependency map does not show, so the day that sibling is removed
 * the bundle fails on a dangling reference instead of the module having said it needs it.
 *
 * Only authored refs are checked. The data export's sections are added by the bundler from each
 * module's `x-personal-data` and reach into every module on purpose: they dangle nowhere, since
 * a removed module takes its section with it.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

/** `src/modules`, resolved from this file. */
const MODULES = path.join(__dirname, '..', '..', 'src', 'modules');

/** A sibling file reference: `$ref: '../<module>/openapi.yaml#...'`. */
const SIBLING_REF = /\$ref:\s*['"]\.\.\/([a-z-]+)\/openapi\.yaml#/g;

/** One cross-module reference: who wrote it and whom it points at. */
interface CrossReference {
    from: string;
    to: string;
}

/** Every module folder that ships a contract. */
const withContract = (): string[] =>
    readdirSync(MODULES, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => {
            try {
                readFileSync(path.join(MODULES, name, 'openapi.yaml'));
                return true;
            } catch {
                return false;
            }
        });

/** The siblings one module's contract refers to, one entry per reference. */
const referencesOf = (module: string): CrossReference[] =>
    [...readFileSync(path.join(MODULES, module, 'openapi.yaml'), 'utf8').matchAll(SIBLING_REF)]
        .map((match) => ({ from: module, to: match[1] }))
        .filter(({ to }) => to !== module);

/** What `module.yaml` says the module depends on. */
const dependenciesOf = (module: string): string[] => {
    const { dependsOn } = parseYaml(
        readFileSync(path.join(MODULES, module, 'module.yaml'), 'utf8')
    ) as { dependsOn?: string[] };
    return dependsOn ?? [];
};

describe('contract references and dependsOn', () => {
    const references = withContract().flatMap((module) => referencesOf(module));

    it('finds the references it means to check', () => {
        // Exact, not "at least": a sweep that silently found nothing would pass for ever.
        expect(references).toHaveLength(16);
    });

    it('has every cross-module $ref declared as a dependency of the module that writes it', () => {
        const undeclared = references
            .filter(({ from, to }) => !dependenciesOf(from).includes(to))
            .map(({ from, to }) => `${from} -> ${to}`);

        expect([...new Set(undeclared)]).toEqual([]);
    });
});
