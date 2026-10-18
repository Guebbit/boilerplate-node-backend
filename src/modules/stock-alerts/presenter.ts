/**
 * @module
 * The one place stored requests become the wire shape `openapi.yaml` declares. Built rather than
 * serialized, so a field the contract does not name can never leak.
 */

import type { StockAlertsResponse } from '@types';
import type { StockAlertDocument } from './model';

/** A user's own requests, newest first, as the contract declares them. */
export const presentStockAlerts = (alerts: readonly StockAlertDocument[]): StockAlertsResponse => ({
    items: alerts.map((alert) => ({
        productId: String(alert.productId),
        createdAt: (alert.createdAt ?? new Date(0)).toISOString()
    }))
});
