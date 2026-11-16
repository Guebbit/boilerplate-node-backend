/**
 * @module
 * Shop — public barrel; the only surface a sibling module may import. The readers are the module's
 * whole domain: every sibling asks them rather than reading the config itself. The config slice and
 * the manifest are wiring, which a barrel never publishes.
 *
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 * @see docs/modules/shop.md#its-neighbourhood
 */

export * from './service';
