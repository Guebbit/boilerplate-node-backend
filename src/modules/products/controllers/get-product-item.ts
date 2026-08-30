import { productService } from '../service';
import { callerContextOf } from '@infrastructure/http/request';
import { createItemController } from '@infrastructure/surfaces/create-item-controller';

/**
 * GET /products/:id
 * Get a single product by path id.
 * Only admin can see non-active (inactive/deleted) products.
 */
export const getProductItem = createItemController({
    entity: 'product',
    notFoundKey: 'products.not-found',
    // Which rows this caller may read — `getAuth` on the route is what makes the role readable here.
    fetch: (id, request) =>
        productService.getByIdViewed(
            id,
            productService.callerScope(request.authContext),
            callerContextOf(request)
        )
});
