/**
 * @module
 * One typed reader for a module's `module.yaml`, shared by the docs generator that colours the
 * module graph and the cross-cutting test that proves every descriptor is well-formed — a second,
 * hand-rolled parse of the same file drifts the moment one of them adds a field the other doesn't
 * know about.
 */

import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/** `dependsOn`, `subdomain` and `group`, nothing else — an extra key is a typo or a misunderstanding of what this file is for. */
export const moduleDescriptorSchema = z
    .object({
        subdomain: z.enum(['core', 'supporting', 'generic']),
        /**
         * Whether this module belongs to every deployment (`foundation`) or is the demo shop's own
         * worked example (`shop`) — see `docs/theory/strategic-ddd.md`'s foundation/shop section.
         * `.dependency-cruiser.cjs`'s `foundation-cannot-reach-shop` rule reads this, fail-closed:
         * the line is enforced, not aspirational.
         */
        group: z.enum(['foundation', 'shop']),
        dependsOn: z.array(z.string())
    })
    .strict();

/** A module's own `module.yaml`, once parsed and validated. */
export type ModuleDescriptor = z.infer<typeof moduleDescriptorSchema>;

/** Reads and validates one module's descriptor off disk — throws if it doesn't match the schema. */
export const readModuleDescriptor = (descriptorPath: string): ModuleDescriptor =>
    moduleDescriptorSchema.parse(parseYaml(readFileSync(descriptorPath, 'utf8')));
