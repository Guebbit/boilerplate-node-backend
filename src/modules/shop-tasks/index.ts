/**
 * @module
 * Shop-tasks — public barrel; the only surface a sibling may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule). The module owns no event of its own and no
 * route, so what is published is the service and the digest mail.
 *
 * See: docs/modules/shop-tasks.md
 */

export * from './services';

export * from './emails';
