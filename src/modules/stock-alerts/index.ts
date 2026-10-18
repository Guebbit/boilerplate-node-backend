/**
 * @module
 * Stock alerts — public barrel; the only surface a sibling may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule).
 *
 * See: docs/modules/stock-alerts.md
 */

export * from './service';

export * from './events';

export * from './emails';

export type * from './model';
