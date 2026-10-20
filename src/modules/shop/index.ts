/**
 * @module
 * Shop — public barrel; the only surface a sibling module may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). The readers are the module's whole domain:
 * every sibling asks them rather than reading `NODE_SHOP_*` itself. The config slice and the
 * manifest are wiring, which a barrel never publishes.
 *
 * See: docs/modules/shop.md
 */

export * from './service';
