/**
 * @module
 * The one contract fragment that still names shop modules by hand:
 * `shared/contracts/openapi.root.yaml` — "what belongs to no module" (CLAUDE.md's contract
 * workflow) — carries the data export's `AccountExportResponse` (one field per
 * contributing module, so it belongs to no one module). The path index
 * is not hand-edited on removal: the bundler completes it from the fragments on disk.
 *
 * `demo-remove.ts` edits the export schema here rather than leaving it to a human reading a
 * `no-unresolved-refs` failure. This is a CONTRACT change: the caller still has to run
 * `npm run regenerate` afterward, same as any other (CLAUDE.md's "Changing a contract").
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isMap, isSeq, parseDocument } from 'yaml';
import type { RemovalNote } from './demo-remove-registry';

/**
 * The export sections a `group: shop` or `group: example` module contributes. Every other section
 * (`profile`, `roles`, `addresses`, `sessions`, `auditLog`, `apiKeys`) belongs to a foundation
 * module and stays.
 */
const DEMO_EXPORT_SECTIONS = [
    'orders',
    'payments',
    'shipments',
    'cart',
    'wishlist',
    'invoicing',
    'returns',
    'examples',
    'notifications'
] as const;

/**
 * Edit `AccountExportResponse` in `shared/contracts/openapi.root.yaml`: drop the sections the shop
 * modules and the example module contribute from both `required` and `properties`.
 *
 * Edited as a YAML document, by key, so a section appended to the schema later or a reordered
 * `required` list does not break the strip (an exact-text match did). `account`'s own export
 * service already reads its section list off `enabledModules`
 * (`src/modules/account/services/personal-data-registry.ts`) and omits a section no module
 * registers, so only the CONTRACT is behind once those modules are gone.
 *
 * @param repoRoot - the repository root
 * @throws {Error} when the schema is not where the strip expects it
 */
export const stripAccountExportSchema = (repoRoot: string): RemovalNote => {
    const file = path.join(repoRoot, 'shared', 'contracts', 'openapi.root.yaml');
    const label = 'shared/contracts/openapi.root.yaml';
    // yaml: a Document keeps comments and key order, unlike `parse`. https://eemeli.org/yaml/#documents
    const document = parseDocument(readFileSync(file, 'utf8'));

    const schema = document.getIn(['components', 'schemas', 'AccountExportResponse'], true);
    if (!isMap(schema))
        throw new Error(`[demo-remove] AccountExportResponse not found in ${label}`);
    const properties = schema.get('properties', true);
    const required = schema.get('required', true);
    if (!isMap(properties) || !isSeq(required))
        throw new Error(
            `[demo-remove] AccountExportResponse has no properties/required in ${label}`
        );

    const dropped = DEMO_EXPORT_SECTIONS.filter((section) => properties.delete(section));
    required.items = required.items.filter(
        (item) => !(DEMO_EXPORT_SECTIONS as readonly unknown[]).includes(String(item))
    );

    // lineWidth 0: never re-wrap a long description; indent 4: the file's own style.
    writeFileSync(file, document.toString({ lineWidth: 0, indent: 4 }));
    return {
        file: label,
        detail: `dropped ${dropped.join('/')} from AccountExportResponse`
    };
};
