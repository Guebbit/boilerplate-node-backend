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
import type { RemovalNote } from './demo-remove-registry';

/**
 * Edit `AccountExportResponse` in `shared/contracts/openapi.root.yaml`: drop the fields seven shop
 * modules contribute (`orders`, `payments`, `shipments`, `cart`, `wishlist`, `invoicing`, `returns`) and the example module's `examples` from both
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
        // A function replacer: a string one would read `$&` / `$1` in `replace` as patterns.
        content = content.replace(search, () => replace);
    };

    mustReplace(
        '                    exportedAt,\n                    profile,\n                    roles,\n                    addresses,\n                    orders,\n                    payments,\n                    shipments,\n                    cart,\n                    wishlist,\n                    sessions,\n                    auditLog,\n                    apiKeys,\n                    invoicing,\n                    returns,\n                    examples\n                ]',
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
        "                # Every invoice/credit note issued for one of this account's OWN orders — collected\n                # by `orderId`, since neither collection is itself keyed by `userId`. Empty arrays,\n                # never absent, for an account with no paid orders yet.\n                invoicing:\n                    type: object\n                    additionalProperties: false\n                    required: [invoices, creditNotes]\n                    properties:\n                        invoices:\n                            type: array\n                            items:\n                                $ref: '../../src/modules/invoicing/openapi.yaml#/components/schemas/ExportInvoiceDocument'\n                        creditNotes:\n                            type: array\n                            items:\n                                $ref: '../../src/modules/invoicing/openapi.yaml#/components/schemas/ExportInvoiceDocument'\n                # Every return on one of this account's OWN orders — a withdrawal included — found by\n                # `orderId`, since a return is keyed by the order and never by the user. Empty, never\n                # absent, for an account that has returned nothing.\n                returns:\n                    type: array\n                    items:\n                        $ref: '../../src/modules/returns/openapi.yaml#/components/schemas/ExportReturn'\n                # Every example this account owns, drafts and archived included. Empty, never absent.\n                examples:\n                    type: array\n                    items:\n                        $ref: '../../src/modules/example/openapi.yaml#/components/schemas/Example'\n",
        ''
    );

    writeFileSync(file, content);
    return {
        file: label,
        detail: 'dropped orders/payments/shipments/cart/wishlist/invoicing/returns/examples from AccountExportResponse'
    };
};
