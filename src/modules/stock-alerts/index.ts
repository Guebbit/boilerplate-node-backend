/**
 * @module
 * Stock alerts — public barrel; the only surface a sibling may import (see
 * `docs/understand/strategic-ddd.md` §5 for the rule).
 *
 * @see docs/modules/stock-alerts.md#its-neighbourhood
 */

export * from './service';

export * from './events';

export * from './emails';

export type * from './model';
