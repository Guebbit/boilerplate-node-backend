/**
 * A contract schema is declared once, in `openapi.yaml` — never restated in TypeScript.
 *
 * Orval turns every schema in the bundle into a type under `@api/models`, re-exported from
 * `@types`, which is importable from every tier including `domain/` (`inventory/domain/transitions.ts`
 * imports one today). So a handwritten `interface` that carries a generated type's name is a second
 * declaration of a shape the contract already owns: nothing keeps the two in step, and the copy
 * wins at every call site that happens to import it. `FacetCount`, `InventoryLevel`,
 * `ShippingMethod`, `PaymentStatus` and `ShipmentStatus` were each written out that way, and each
 * would have gone on answering the old shape after `openapi.yaml` moved.
 *
 * The rule is the name, not the shape: matching names are what makes the duplication invisible in
 * review, and a genuinely different type deserves a different word. Storage shapes are the
 * exception — a Mongoose document holds `Types.ObjectId` where the wire holds a string — so those
 * are named here, individually, with the reason.
 *
 * The scan reads the generated SOURCE rather than importing it: an `interface` has no runtime
 * value, so `import * as models` would see the four enums and miss the two hundred shapes.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.join(__dirname, '../..');
const GENERATED_ROOT = path.join(REPO_ROOT, 'api/models');
const SRC_ROOT = path.join(REPO_ROOT, 'src');

/**
 * Names a module may declare despite the contract using them, and why.
 *
 * Each is the PERSISTED shape of a wire schema of the same name: `productId` is an `ObjectId` in
 * the collection and a string on the wire, so they are two types that happen to describe one
 * concept. Extending this list is a decision — the default answer is to import the generated type.
 */
const STORAGE_SHAPES: Record<string, string> = {
    CartItem: 'src/modules/cart/model.ts — stored line, `productId` is an ObjectId',
    WishlistItem: 'src/modules/wishlist/model.ts — stored line, `productId` is an ObjectId'
};

/**
 * Names `infrastructure` must keep declaring, because importing them would invert a tier.
 *
 * `@types` is not in `infrastructure`'s `no-restricted-imports` list, so nothing stops the import
 * mechanically — but the bundle is assembled from each module's `openapi.yaml`, and a schema a
 * module's fragment owns is that module's, whichever file orval emits it into. Taking one into
 * `infrastructure` makes the tier below depend on a domain above it and breaks the build the day
 * that module is deleted, which is the same trade `infrastructure/http/schemas.ts` refuses by name.
 *
 * The duplication is real and is the lesser cost: `tests/unit/infrastructure/observability` and the
 * contract suite each pin one side, so a divergence surfaces as a failing probe rather than silence.
 */
const TIER_BOUNDARY: Record<string, string> = {
    DependencyStatus:
        'src/infrastructure/observability/dependency-health.ts — the schema belongs to the ' +
        '`observability` MODULE; infrastructure sits below it and may not import upward'
};

const ALLOWED = { ...STORAGE_SHAPES, ...TIER_BOUNDARY };

/** Every `.ts` file under a root, recursively. */
const filesUnder = (root: string): string[] =>
    readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) return filesUnder(full);
        return entry.isFile() && full.endsWith('.ts') ? [full] : [];
    });

/** The names a file exports as a type, an interface or a const. */
const exportedNames = (file: string, kinds: string): string[] =>
    [
        ...readFileSync(file, 'utf8').matchAll(
            new RegExp(String.raw`^export (?:${kinds}) (\w+)`, 'gm')
        )
    ].map(([, name]) => name);

const generatedNames = new Set(
    filesUnder(GENERATED_ROOT).flatMap((file) => exportedNames(file, 'interface|type|const'))
);

/** Handwritten declarations, as `name` → the file that declares it. */
const handwritten = filesUnder(SRC_ROOT)
    // The AsyncAPI half is generated too; it is a source of names, never a shadow of them.
    .filter((file) => !file.endsWith('asyncapi.generated.ts'))
    .flatMap((file) =>
        exportedNames(file, 'interface|type').map(
            (name) => [name, path.relative(REPO_ROOT, file)] as const
        )
    );

describe('generated types are not shadowed by hand', () => {
    it('finds the generated names it means to compare against', () => {
        // A canary: were `api/models` renamed or emptied, every assertion below would pass over
        // nothing and the rule would quietly stop being enforced.
        expect(generatedNames.size).toBeGreaterThan(100);
        expect(generatedNames.has('Order')).toBe(true);
        expect(handwritten.length).toBeGreaterThan(50);
    });

    it('declares no type the contract already names', () => {
        const shadows = handwritten
            .filter(([name]) => generatedNames.has(name) && !(name in ALLOWED))
            .map(([name, file]) => `${name} (${file}) — import it from '@types' instead`);

        expect(shadows).toEqual([]);
    });

    it('keeps the allowances honest', () => {
        // An allowance that no longer collides is a note about a problem someone already fixed.
        // Left in place it silently pre-approves the next copy to take that name.
        const stale = Object.keys(ALLOWED).filter(
            (name) =>
                !generatedNames.has(name) || !handwritten.some(([declared]) => declared === name)
        );

        expect(stale).toEqual([]);
    });
});
