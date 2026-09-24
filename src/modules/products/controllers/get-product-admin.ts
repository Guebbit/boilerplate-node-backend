/**
 * @module
 * Admin read controller — every language a product has, for the editor's form to populate its
 * tabs. Built on `createItemController` with `handlerSuffix: 'Admin'`, since the factory's default
 * (`get<Entity>Item`) would collide with `get-product-item.ts`'s own handler on the same entity.
 * The CastError-to-404 handling this needed — a malformed id and an unknown one look identical
 * from outside — is the factory's own default behaviour, so nothing extra is needed here.
 */

import { productService } from '../service';
import { createItemController } from '@infrastructure/surfaces/create-item-controller';

/** GET /products/:id/admin — a product with every language it has a row for, admin only. */
export const getProductAdmin = createItemController({
    entity: 'product',
    notFoundKey: 'products.not-found',
    handlerSuffix: 'Admin',
    fetch: (id) => productService.getAdmin(id)
});
