/**
 * Every module's `module.yaml` is well-formed — the hygiene half of the rule
 * `.dependency-cruiser.cjs` enforces. That file's job is to fail closed no matter what a
 * descriptor says; this file's job is to catch the sloppy descriptor itself, before it is trusted:
 * a missing file, a stray field, a self-reference, a name that is not a real module, a duplicate,
 * or an edge list out of alphabetical order.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');

/** Every module folder, read off disk rather than off the registry — a descriptor is required whether or not the module is enabled. */
const moduleNames = readdirSync(MODULES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();

/** `dependsOn` and `subdomain`, nothing else — an extra key is a typo or a misunderstanding of what this file is for. */
const descriptorSchema = z
    .object({
        subdomain: z.enum(['core', 'supporting', 'generic']),
        dependsOn: z.array(z.string())
    })
    .strict();

describe.each(moduleNames)('%s/module.yaml', (name) => {
    const descriptorPath = path.join(MODULES_ROOT, name, 'module.yaml');

    it('exists', () => {
        expect(existsSync(descriptorPath)).toBe(true);
    });

    it('parses against the strict schema', () => {
        const raw = parseYaml(readFileSync(descriptorPath, 'utf8'));
        expect(() => descriptorSchema.parse(raw)).not.toThrow();
    });

    it('names only real modules, never itself, with no duplicates, alphabetically', () => {
        const { dependsOn } = descriptorSchema.parse(
            parseYaml(readFileSync(descriptorPath, 'utf8'))
        );

        expect(dependsOn).not.toContain(name);
        for (const sibling of dependsOn) expect(moduleNames).toContain(sibling);
        expect(new Set(dependsOn).size).toBe(dependsOn.length);
        expect(dependsOn).toEqual(dependsOn.toSorted());
    });
});
