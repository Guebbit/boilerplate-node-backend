/**
 * @module
 * One typed reader for a module's `module.yaml`, shared by the docs generator that colours the
 * module graph and the cross-cutting test that proves every descriptor is well-formed — a second,
 * hand-rolled parse of the same file drifts the moment one of them adds a field the other doesn't
 * know about.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { modulesWith } from '../modules-on-disk';
import { jobsBlockSchema } from '../../src/infrastructure/config/shared-rules/jobs';
import { rateLimitsBlockSchema } from '../../src/infrastructure/config/shared-rules/rate-limits';

/**
 * Everything a module says about itself outside its code. Every hand-kept table a new module used
 * to be entered in (the docs index, the audit exemptions) reads from here, so
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
        /**
         * The module's rate-limit budgets as data. `npm run regenerate` writes
         * `<module>/rate-limits.generated.ts` from it; `rate-limits.ts` adds the key and skip logic.
         */
        rateLimits: rateLimitsBlockSchema.optional(),
        /**
         * The module's scheduled jobs as data (name, cron, summary). `npm run regenerate` writes
         * `<module>/jobs.generated.ts` from it; `jobs.ts` adds what each one runs.
         */
        jobs: jobsBlockSchema.optional()
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
        modulesWith(modulesRoot, 'module.yaml').map((name) => [
            name,
            readModuleDescriptor(path.join(modulesRoot, name, 'module.yaml'))
        ])
    );
