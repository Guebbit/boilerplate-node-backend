/**
 * @module
 * G-D2 step 2/3, the one contract fragment that names shop modules by hand:
 * `shared/contracts/openapi.root.yaml` — "what belongs to no module" (CLAUDE.md's contract
 * workflow) — carries the whole-API `paths:` merge (one `$ref` per module's own path, under a
 * `# ---------- <module> ----------` header) and `POST /account/export`'s `AccountExportResponse`
 * (one field per contributing module, `account`'s own fragment cannot name a sibling's schema).
 *
 * Both are a census this file has to keep in sync with which modules exist — `demo-remove.ts`
 * does that edit here rather than leaving it to a human running `npm run contracts:bundle` and
 * reading a `no-unresolved-refs` failure. This is a CONTRACT change: the caller still has to run
 * `npm run regenerate` afterward, same as any other (CLAUDE.md's "Changing a contract").
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RemovalNote } from './demo-remove-registry';

/**
 * Drop every `paths:` entry whose `$ref` points at a shop module's own `openapi.yaml` — the
 * two-line `<path>:` / `$ref: '…/src/modules/<name>/openapi.yaml…'` pair, wherever it sits, found
 * by the `$ref`'s OWN module name rather than by the path spelling next to it.
 */
const stripPathCensusEntries = (content: string, names: readonly string[]): string =>
    content.replaceAll(
        // `^`/`m` anchors each match to the START of its own line rather than consuming the
        // PREVIOUS line's newline: two matches sitting back to back share that newline, and a
        // pattern that consumes it as part of match N leaves match N+1 with no `\n` of its own
        // left to open on, skipping every other entry — the bug an earlier version of this had.
        new RegExp(
            String.raw`^ {4}[^\n]+:\n {8}\$ref: '\.\./\.\./src/modules/(?:${names.join('|')})/openapi\.yaml[^\n]*'\n`,
            'gm'
        ),
        ''
    );

/**
 * Drop the now-empty `# ---------- <module> ----------` section header a removed module's `paths:`
 * entries left behind — cosmetic (a dangling header names no error `redocly bundle` would raise),
 * done anyway so the file does not go on describing sections that no longer exist.
 */
const stripSectionHeaders = (content: string, names: readonly string[]): string =>
    content.replaceAll(
        new RegExp(String.raw`^ {4}# -+ (?:${names.join('|')}) -+[^\n]*\n(?: {4}#[^\n]*\n)*`, 'gm'),
        ''
    );

/** Edit `shared/contracts/openapi.root.yaml`'s `paths:` census: drop every shop module's routes. */
export const stripContractPathCensus = (
    repoRoot: string,
    shopNames: readonly string[]
): RemovalNote => {
    const file = path.join(repoRoot, 'shared', 'contracts', 'openapi.root.yaml');
    const label = 'shared/contracts/openapi.root.yaml';
    const before = readFileSync(file, 'utf8');

    const withoutEntries = stripPathCensusEntries(before, shopNames);
    if (withoutEntries === before)
        throw new Error(`[demo-remove] expected shop module path entries not found in ${label}`);

    writeFileSync(file, stripSectionHeaders(withoutEntries, shopNames));
    return { file: label, detail: `removed the ${shopNames.join(', ')} path sections` };
};

/**
 * Edit `AccountExportResponse` in `shared/contracts/openapi.root.yaml`: drop the fields seven shop
 * modules contribute (`orders`, `payments`, `shipments`, `cart`, `wishlist`, `invoicing`, `returns`) from both
 * `required` and `properties` — `account`'s own export service already reads its section list off
 * `enabledModules` (`src/modules/account/services/personal-data-registry.ts`) and simply omits a
 * section no module registers, so only the CONTRACT is behind once those modules are gone.
 */
export const stripAccountExportSchema = (repoRoot: string): RemovalNote => {
    const file = path.join(repoRoot, 'shared', 'contracts', 'openapi.root.yaml');
    const label = 'shared/contracts/openapi.root.yaml';
    let content = readFileSync(file, 'utf8');

    const mustReplace = (search: string, replace: string): void => {
        if (!content.includes(search))
            throw new Error(
                `[demo-remove] expected AccountExportResponse text not found in ${label}`
            );
        content = content.replace(search, replace);
    };

    mustReplace(
        '                    exportedAt,\n                    profile,\n                    roles,\n                    addresses,\n                    orders,\n                    payments,\n                    shipments,\n                    cart,\n                    wishlist,\n                    sessions,\n                    auditLog,\n                    apiKeys,\n                    invoicing,\n                    returns\n                ]',
        '                    exportedAt,\n                    profile,\n                    roles,\n                    addresses,\n                    sessions,\n                    auditLog,\n                    apiKeys\n                ]'
    );
    mustReplace(
        "                orders:\n                    type: array\n                    items:\n                        $ref: '#/components/schemas/Order'\n",
        ''
    );
    mustReplace(
        "                payments:\n                    type: array\n                    items:\n                        $ref: '../../src/modules/payments/openapi.yaml#/components/schemas/ExportPayment'\n",
        ''
    );
    mustReplace(
        "                shipments:\n                    type: array\n                    items:\n                        $ref: '../../src/modules/delivery/openapi.yaml#/components/schemas/ExportShipment'\n",
        ''
    );
    mustReplace(
        "                cart:\n                    type: array\n                    items:\n                        $ref: '#/components/schemas/CartItem'\n",
        ''
    );
    mustReplace(
        "                wishlist:\n                    type: array\n                    items:\n                        type: object\n                        additionalProperties: false\n                        required: [productId]\n                        properties:\n                            productId:\n                                $ref: '#/components/schemas/Id'\n",
        ''
    );
    mustReplace(
        "                # Every invoice/credit note issued for one of this account's OWN orders — collected\n                # by `orderId`, since neither collection is itself keyed by `userId`. Empty arrays,\n                # never absent, for an account with no paid orders yet.\n                invoicing:\n                    type: object\n                    additionalProperties: false\n                    required: [invoices, creditNotes]\n                    properties:\n                        invoices:\n                            type: array\n                            items:\n                                $ref: '../../src/modules/invoicing/openapi.yaml#/components/schemas/ExportInvoiceDocument'\n                        creditNotes:\n                            type: array\n                            items:\n                                $ref: '../../src/modules/invoicing/openapi.yaml#/components/schemas/ExportInvoiceDocument'\n                # Every return on one of this account's OWN orders — a withdrawal included — found by\n                # `orderId`, since a return is keyed by the order and never by the user. Empty, never\n                # absent, for an account that has returned nothing.\n                returns:\n                    type: array\n                    items:\n                        $ref: '../../src/modules/returns/openapi.yaml#/components/schemas/ExportReturn'\n",
        ''
    );

    writeFileSync(file, content);
    return {
        file: label,
        detail: 'dropped orders/payments/shipments/cart/wishlist/invoicing/returns from AccountExportResponse'
    };
};
