/**
 * @module
 * Shop — public barrel; the only surface a sibling module may import (see
 * `docs/understand/strategic-ddd.md` §5 for the rule). The readers are the module's whole domain:
 * every sibling asks them rather than reading the config itself. The config slice and the
 * manifest are wiring, which a barrel never publishes.
 *
 * @see docs/modules/shop.md
 */

export * from './service';
