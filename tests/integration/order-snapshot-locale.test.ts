/**
 * An order line snapshot freezes the BUYER's language, not the request's and not the reader's, at
 * the moment it's embedded — never re-resolved later. Cross-module by nature (order creation is
 * `orders`'/`cart`'s, the translation row is `locales`'), so this lives at the top level rather
 * than under any one module's `tests/`, the same reasoning `translation-resolution.test.ts`
 * documents for the read path this mirrors.
 */

import '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/caller-context';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { orderService } from '@modules/orders';
import { cartService } from '@modules/cart';
import type { OrderDocument } from '@modules/orders';
import type { ResponseSuccess } from '@infrastructure/http/response';
import { localeRepository, translationRepository } from '@modules/locales/repository';
import { makeLocale } from '@modules/locales/factories';

setupTestDb();

/** `en` is the fallback locale in every environment this suite runs in — see `.env-example`. */
const FALLBACK = 'en';

const givenLocale = (tag: string) =>
    localeRepository.create(makeLocale({ tag, name: tag, nativeName: tag }));

const givenTranslation = (
    productId: string,
    locale: string,
    fields: { title: string; description?: string }
) =>
    translationRepository.upsertEntityLocale(
        'product',
        productId,
        locale,
        fields,
        'human',
        undefined,
        locale === FALLBACK ? undefined : 'digest'
    );

const asSuccess = (result: unknown) => result as ResponseSuccess<OrderDocument>;

describe("orderService.create freezes the snapshot in the buyer's stored locale", () => {
    it("embeds the Italian title/description from `user.locale`, over the caller's own", async () => {
        // The admin path: an English-speaking operator placing an order for an Italian customer.
        // The caller's locale is deliberately the WRONG answer here — if it ever wins again, the
        // customer is mailed a receipt in a language they never chose, frozen beyond repair.
        await givenLocale('it');
        const user = await createUser({ locale: 'it' });
        const product = await createProduct({ title: 'Dog Bed', description: 'A soft bed' });
        await givenTranslation(String(product._id), 'it', {
            title: 'Cuccia',
            description: 'Una cuccia morbida'
        });

        const result = await orderService.create(
            String(user._id),
            user.email,
            [{ productId: String(product._id), quantity: 1 }],
            { ...testCallerContext, locale: 'en' }
        );

        const order = asSuccess(result).data!;
        expect(order.items[0].locale).toBe('it');
        expect(order.items[0].product.title).toBe('Cuccia');
        expect(order.items[0].product.description).toBe('Una cuccia morbida');
        // The order's own `_id`, not a freshly minted one — `resolveSnapshotProducts` merges
        // through `.toObject()`, never `.toJSON()`, exactly to keep this true.
        expect(String(order.items[0].product._id)).toBe(String(product._id));
    });

    it("falls back to the source text, still framed as the buyer's locale", async () => {
        const user = await createUser({ locale: 'it' });
        const product = await createProduct({ title: 'Dog Bed' });

        const result = await orderService.create(
            String(user._id),
            user.email,
            [{ productId: String(product._id), quantity: 1 }],
            { ...testCallerContext, locale: 'en' }
        );

        const order = asSuccess(result).data!;
        expect(order.items[0].locale).toBe('it');
        expect(order.items[0].product.title).toBe('Dog Bed');
    });
});

describe("cartService.orderConfirm freezes the snapshot in the buyer's stored locale", () => {
    it('embeds the Italian title and records the frozen locale, from `user.locale`', async () => {
        await givenLocale('it');
        const user = await createUser({ locale: 'it' });
        const product = await createProduct({ title: 'Dog Bed' });
        await givenTranslation(String(product._id), 'it', { title: 'Cuccia' });

        await cartService.cartItemSetById(user.id, String(product._id), 1);
        const result = await cartService.orderConfirm(user.id, testCallerContext);

        const order = asSuccess(result).data!;
        expect(order.items[0].locale).toBe('it');
        expect(order.items[0].product.title).toBe('Cuccia');
        expect(String(order.items[0].product._id)).toBe(String(product._id));
    });
});
