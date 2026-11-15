/**
 * @module
 * Stats — public barrel; the only surface a sibling may import (see
 * `docs/understand/strategic-ddd.md` §5 for the rule). Nothing depends on this module today; the
 * barrel exists because every module publishes one.
 *
 * @see docs/modules/stats.md
 */

export * from './services';

export * from './domain';
