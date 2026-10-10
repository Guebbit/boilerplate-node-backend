/**
 * The two ceilings `config.ts` clamps to are the ones the contract promises. A drift between the
 * constant and the schema would let the service accept what the schema refuses, or the reverse.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
    ADMIN_ORDER_LINE_QUANTITY_CEILING,
    ADMIN_ORDER_LINES_CEILING
} from '@modules/orders/config';

/** The parts of `orders/openapi.yaml` this test reads. */
interface OrdersContract {
    components: {
        schemas: {
            CreateOrderRequest: { properties: { items: { maxItems: number } } };
            OrderLineInput: { properties: { quantity: { maximum: number } } };
        };
    };
}

const contract = parseYaml(
    readFileSync(path.join(__dirname, '..', '..', 'openapi.yaml'), 'utf8')
) as OrdersContract;

describe('the admin order ceilings', () => {
    it('match the contract’s maxItems and maximum', () => {
        expect(ADMIN_ORDER_LINES_CEILING).toBe(
            contract.components.schemas.CreateOrderRequest.properties.items.maxItems
        );
        expect(ADMIN_ORDER_LINE_QUANTITY_CEILING).toBe(
            contract.components.schemas.OrderLineInput.properties.quantity.maximum
        );
    });
});
