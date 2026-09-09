/**
 * @module
 * Resolving a catalogue product into the order line snapshot an order freezes. Lives in
 * `services/`, not `../domain`: the domain tier touches no infrastructure, and this reaches
 * `@infrastructure/i18n` on purpose.
 */

import type { Types } from 'mongoose';
import { localeCandidatesFor, resolveTranslations, runWithLocale } from '@infrastructure/i18n';

/**
 * Resolves each product's translatable fields (`title`/`description`) into `locale`, ready to
 * freeze into an order line snapshot.
 *
 * Takes plain objects, not hydrated documents: `{ ...plain, ...fields }` below only overlays the
 * translated fields correctly on real own properties, which a Mongoose document does not expose
 * the way a plain object does. `productRepository.findByIdRaw`'s `Lean<ProductDocument>` already
 * satisfies this; a caller holding a hydrated document (e.g. from `populate()`) must call
 * `.toObject()` — never `.toJSON()`, which turns `_id` into a string `id` and would make Mongoose
 * mint a FRESH `_id` when the result is assigned into `orderLineProductSchema`'s embedded path,
 * silently breaking `orderRepository.search`'s `productId` filter (`items.product._id`, see
 * `../repository.ts`) — before calling this.
 *
 * Binds `locale` explicitly with `runWithLocale` rather than reading the ambient one: order
 * creation resolves the BUYER's stored or requested locale, which can differ from whatever the
 * current request negotiated — out-of-band work must bind, not read ambient context. See
 * `docs/tools/i18n.md`.
 *
 * @param locale - the language to resolve into, already known by the caller
 * @param products - the catalogue rows about to be embedded as order lines, already plain
 * @returns the same products, each with `title`/`description` overlaid in `locale` where a
 *   translation row exists; unchanged otherwise
 */
export const resolveSnapshotProducts = <T extends { _id: Types.ObjectId }>(
    locale: string,
    products: readonly T[]
): Promise<T[]> =>
    runWithLocale(locale, () =>
        resolveTranslations(
            'product',
            products.map((product) => String(product._id)),
            localeCandidatesFor(locale)
        ).then((resolved) =>
            products.map((product) => {
                const fields = resolved.get(String(product._id));
                return fields ? { ...product, ...fields } : product;
            })
        )
    );
