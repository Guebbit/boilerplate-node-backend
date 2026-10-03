/**
 * @module
 * One typed reader for a module's `module.yaml`, shared by the docs generator that colours the
 * module graph and the cross-cutting test that proves every descriptor is well-formed — a second,
 * hand-rolled parse of the same file drifts the moment one of them adds a field the other doesn't
 * know about.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/**
 * How a module's screen pairs with the paired frontend, when it is not simply "a frontend module of
 * the same name". Omitted for the ordinary case.
 */
export const frontendPairingSchema = z
    .object({
        /** Frontend module names that cover this domain. Empty means nothing over there does. */
        counterparts: z.array(z.string()),
        /** One sentence, present tense. Required whenever the counterpart is not the module's own name. */
        why: z.string().min(1).optional()
    })
    .strict();

/**
 * Everything a module says about itself outside its code. Every hand-kept table a new module used
 * to be entered in (the docs index, the audit exemptions, the frontend pairing) reads from here, so
 * adding a module edits its own folder and `src/modules.ts` and nothing else.
 *
 * Strict: an extra key is a typo or a misunderstanding of what this file is for.
 */
export const moduleDescriptorSchema = z
    .object({
        /** One sentence for the docs index and sidebar: what the domain is for. */
        summary: z.string().min(1),

        subdomain: z.enum(['core', 'supporting', 'generic']),
        /**
         * Whether this module belongs to every deployment (`foundation`), is the demo shop's own
         * worked example (`shop`), or is the one `example` module that exists only to be copied —
         * see `docs/theory/strategic-ddd.md`'s foundation/shop section.
         * `.dependency-cruiser.cjs`'s `foundation-cannot-reach-shop` and `nothing-reaches-example`
         * rules read this, fail-closed: the line is enforced, not aspirational.
         */
        group: z.enum(['foundation', 'shop', 'example']),
        dependsOn: z.array(z.string()),
        /**
         * Present only on a module that deliberately emits no audit action, holding the reason (`audit-actions.test.ts`
         * reads it, rather than keeping its own list). A module with an `audit.ts`
         * must not carry it.
         */
        noAudit: z.string().min(1).optional(),
        /** Only where the frontend counterpart is not the module's own name. */
        frontend: frontendPairingSchema.optional()
    })
    .strict();

/** A module's own `module.yaml`, once parsed and validated. */
export type ModuleDescriptor = z.infer<typeof moduleDescriptorSchema>;

/** Reads and validates one module's descriptor off disk — throws if it doesn't match the schema. */
export const readModuleDescriptor = (descriptorPath: string): ModuleDescriptor =>
    moduleDescriptorSchema.parse(parseYaml(readFileSync(descriptorPath, 'utf8')));

/**
 * Every module's descriptor, keyed by folder name, read off disk.
 * @param modulesRoot - the `src/modules` directory to scan (the real one, or a scratch copy)
 * @returns one entry per folder carrying a `module.yaml`, in alphabetical order
 */
export const readAllModuleDescriptors = (modulesRoot: string): Record<string, ModuleDescriptor> =>
    Object.fromEntries(
        readdirSync(modulesRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .filter((name) => existsSync(path.join(modulesRoot, name, 'module.yaml')))
            .toSorted()
            .map((name) => [
                name,
                readModuleDescriptor(path.join(modulesRoot, name, 'module.yaml'))
            ])
    );

/**
 * The frontend modules answering for this domain: the descriptor's own list, or the module's own
 * name when it says nothing.
 * @param name - the module folder name
 * @param descriptor - its parsed descriptor
 */
export const frontendCounterparts = (name: string, descriptor: ModuleDescriptor): string[] =>
    descriptor.frontend?.counterparts ?? [name];
