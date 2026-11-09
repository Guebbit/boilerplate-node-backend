/**
 * @module
 * Puts `actions` on a product for the caller reading it, so no client re-derives the rules. The
 * rules are `domain/actions.ts`; this file reads the caller's keys and stamps the result.
 */

import { holds } from '@kernel/ability';
import { hasAnonymousReadScope } from '@kernel/access/query';
import { carryVersion } from '@infrastructure/persistence/versioning';
import type { Caller, Product } from '@types';
import { NO_PRODUCT_STANDING, productActions, type ProductStanding } from '../domain/actions';

/**
 * The caller's standing, from the keys they hold. A write answers with this: it is never cached.
 *
 * @param caller - `request.caller`, or `undefined` for an anonymous request
 */
export const standingOn = (caller?: Caller): ProductStanding =>
    caller
        ? {
              update: holds(caller, 'update', 'Product') && holds(caller, 'update', 'Translation'),
              delete: holds(caller, 'delete', 'Product')
          }
        : NO_PRODUCT_STANDING;

/**
 * The standing to put on a READ.
 *
 * A caller whose read scope is the anonymous one is answered from the cache shared with every
 * guest, so a flag set for them would be served to strangers. Only a caller outside that scope
 * is answered fresh, and only they get a standing.
 *
 * @param scopeOf - the module's read scope, `callerScope`
 * @param caller - `request.caller`, or `undefined` for an anonymous request
 */
export const standingOnRead = (
    scopeOf: (caller?: Caller) => Record<string, unknown>,
    caller?: Caller
): ProductStanding =>
    hasAnonymousReadScope(scopeOf, caller) ? NO_PRODUCT_STANDING : standingOn(caller);

/**
 * The product with its `actions` worked out for this standing.
 *
 * @param product - the wire product
 * @param standing - {@link standingOn} or {@link standingOnRead}, asked once per request
 */
export const withActions = <T extends Product>(product: T, standing: ProductStanding): T =>
    // The row's version rides beside the wire object (for the `ETag`), so the copy is handed it again.
    carryVersion(product, { ...product, actions: productActions(product, standing) });
