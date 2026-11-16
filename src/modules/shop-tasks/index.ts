/**
 * @module
 * Shop-tasks — public barrel; the only surface a sibling may import (see
 * `docs/understand/strategic-ddd.md` §5 for the rule). The module owns no event of its own, so
 * what is published is the openings rules, the service and the digest mail.
 *
 * @see docs/modules/shop-tasks.md#its-neighbourhood
 */

export * from './domain';

export * from './services';

export * from './emails';
