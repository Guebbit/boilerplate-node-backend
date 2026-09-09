/**
 * @module
 * Resolving a catalogue product into the order line snapshot an order freezes. Lives in
 * `services/`, not `../domain`: the domain tier touches no infrastructure, and this reaches
 * `@infrastructure/i18n` on purpose.
 */

import { Types } from 'mongoose';
import { localeCandidatesFor, resolveTranslations, runWithLocale } from '@infrastructure/i18n';

/**
 * Mongoose's hydrated documents carry `toObject()`; a lean read like
 * `productRepository.findByIdRaw`'s result is already plain data with no such method. Narrows the
 * compiler's view of `T` — which types both shapes as the same hydrated document, a lie
 * `findByIdRaw`'s own docblock explains — to whichever the runtime actually handed us, so a
 * snapshot never accidentally embeds Mongoose document machinery (nested subdocuments, virtuals)
 * instead of plain data.
 */
const toPlainRecord = <T extends { _id: Types.ObjectId }>(product: T): T => {
    // Narrows past a type the compiler treats as always-hydrated but sometimes isn't — see above.
    const maybeDocument = product as T & { toObject?: () => T };
    return typeof maybeDocument.toObject === 'function' ? maybeDocument.toObject() : product;
};

/**
 * Resolves each product's translatable fields (`title`/`description`) into `locale`, ready to
 * freeze into an order line snapshot.
 *
 * Binds `locale` explicitly with `runWithLocale` rather than reading the ambient one: order
 * creation resolves the BUYER's stored or requested locale, which can differ from whatever the
 * current request negotiated — out-of-band work must bind, not read ambient context. See
 * `docs/tools/i18n.md`.
 *
 * `.toObject()`, never `.toJSON()`: a `toJSON()`'d document turns `_id` into a string `id`, and
 * assigning that into `orderLineProductSchema`'s embedded path would make Mongoose mint a FRESH
 * `_id` instead of preserving the product's own — silently breaking `orderRepository.search`'s
 * `productId` filter, which matches on `items.product._id` (see `../repository.ts`).
 *
 * @param locale - the language to resolve into, already known by the caller
 * @param products - the catalogue rows about to be embedded as order lines
 * @returns the same products, each with `title`/`description` overlaid in `locale` where a
 *   translation row exists; unchanged (but still plain) otherwise
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
                const plain = toPlainRecord(product);
                const fields = resolved.get(String(product._id));
                return fields ? { ...plain, ...fields } : plain;
            })
        )
    );
