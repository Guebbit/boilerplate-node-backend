/**
 * @module
 * The stock alerts' one knob: how many products one account may wait for at once.
 *
 * @see docs/operate/configuration.md#who-owns-what
 */

import { defineConfig } from '@infrastructure/config/define';
import { int } from '@infrastructure/config/fields';

/** Stock-alert settings: the cap on how many products one account may wait for. */
export const stockAlertsConfig = defineConfig({
    name: 'stock-alerts',
    shape: {
        /** `max: 250` keeps "never paginated" true whatever an operator sets. */
        NODE_STOCK_ALERTS_MAX: int({ default: 100, min: 1, max: 250 })
    }
});

/**
 * The most back-in-stock requests one account may hold. `GET /stock-alerts` is never paginated, so
 * this is what keeps it small. A request is deleted once answered, so a shopper rarely nears it.
 *
 * @see docs/modules/stock-alerts.md#the-cap
 * @returns the cap on requests per account, 1 to 250
 */
export const stockAlertsMax = (): number => stockAlertsConfig().NODE_STOCK_ALERTS_MAX;
