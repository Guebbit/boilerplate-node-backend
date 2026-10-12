/**
 * @module
 * The orders CSV: the list's filters, a cursor, a CSV stream. Nothing is written to disk and
 * nothing is mailed: a file that exists can be forgotten, and a link can be forwarded (GDPR
 * Art. 5(1)(e)). The caller pipes the stream into the response and a client that hangs up stops the
 * cursor with it.
 *
 * See: docs/modules/orders.md#the-csv-export
 */

import { Readable, type Transform } from 'node:stream';
import { stringify } from 'csv-stringify';
import { t } from '@infrastructure/i18n';
import { generateReject, type ResponseReject } from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import type { AuthContext, CallerContext, SearchOrdersRequest } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { ordersAuditActions } from '../audit';
import { orderExportMaxRows } from '../config';
import { ORDER_CSV_COLUMNS, toOrderCsvRow } from '../domain';
import { orderRepository } from '../repository';
import { withFulfillmentFilter } from './read';
import { callerScope } from './scope';

/**
 * The filter as the audit row records it: what was asked, never who it was asked about. An email
 * filter is a person, so only the fact that one was given is kept.
 *
 * @param filters - the validated filter bag
 */
const auditedFilter = (filters: SearchOrdersRequest): Record<string, unknown> => {
    const { email, ...rest } = filters;
    return { ...rest, ...(email === undefined ? {} : { email: true }) };
};

/**
 * The CSV writer for the orders file.
 *
 * `csv-stringify`: a Transform that takes row objects and writes CSV.
 * https://csv.js.org/stringify/options/
 *   header:          write the column names as the first line
 *   columns:         which keys, in which order; the key is also the header text
 *   escape_formulas: prefix a cell starting with `=`, `+`, `-`, `@`, tab or CR with `'`, so a
 *                    spreadsheet reads it as text (OWASP CSV Injection, ASVS 1.2.10). Does not
 *                    cover `\0` or the full-width `＝＋－＠`: documented, not handled.
 */
const orderCsvWriter = () =>
    stringify({ header: true, columns: [...ORDER_CSV_COLUMNS], escape_formulas: true });

/** An opened export: pipe `source` through `csv` into the response. */
export interface OrderExport {
    /** The orders, one object per row, read through a cursor. */
    source: Readable;
    /** Turns each row object into CSV text. */
    csv: Transform;
}

/**
 * The orders as CSV row objects, one at a time.
 *
 * @param filters - the validated filter bag
 * @param scope - what the caller may read, when it is narrowed
 */
async function* csvRows(
    filters: object,
    scope: Record<string, unknown> | undefined
): AsyncGenerator<ReturnType<typeof toOrderCsvRow>> {
    for await (const order of orderRepository.streamMatching(filters, scope))
        yield toOrderCsvRow(order);
}

/**
 * Open the export: refuse it when it is too large, audit it, and hand back what to pipe.
 *
 * The count comes first and is the whole guard: a file is only started for a result the cap allows,
 * so a refusal costs one count and no row is read. The audit row is written when the export is
 * handed over, with the number of rows it will carry — never a row.
 *
 * @param search - the list's filters; paging is ignored, the file is the whole result
 * @param authContext - the caller, whose read scope bounds what the file can hold
 * @param context - the caller, for the audit row
 * @returns the source and the CSV writer, or the 422 asking for narrower filters
 */
export const openOrderExport = (
    search: SearchOrdersRequest,
    authContext: AuthContext | undefined,
    context: CallerContext
): Promise<OrderExport | ResponseReject> => {
    const [filters, scope] = withFulfillmentFilter(search, callerScope(authContext));
    const cap = orderExportMaxRows();

    return orderRepository.countMatching(filters, scope).then((rowCount) => {
        if (rowCount > cap)
            return generateReject(422, [
                {
                    code: ERROR_CODES.ORDER_EXPORT_TOO_LARGE,
                    message: t('orders.export.too-large', { max: cap })
                }
            ]);

        recordAudit(context, {
            action: ordersAuditActions.ADMIN_ORDERS_EXPORTED,
            outcome: 'success',
            targetType: 'order',
            metadata: { filter: auditedFilter(search), rowCount }
        });

        // Readable.from: an object-mode stream over the generator; the caller's `pipeline`
        // destroys it, and the cursor with it, when the client hangs up.
        // https://nodejs.org/api/stream.html#streamreadablefromiterable-options
        return { source: Readable.from(csvRows(filters, scope)), csv: orderCsvWriter() };
    });
};
