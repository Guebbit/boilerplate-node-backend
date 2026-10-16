/**
 * The shop's own jurisdiction (`NODE_SHOP_COUNTRY`, declared on the manifest) — pure env reads, so
 * the unit suite is enough. Also the shop's identity
 * (legal name, address, email, phone), the return address with its fallback to it, and who pays
 * return postage.
 *
 * Driven through `assertModuleConfig` rather than by reading the manifest — the wiring is half
 * of what makes the check run at all.
 *
 * Every case sets `NODE_ENV` away from `test` first: the gate short-circuits under the test
 * environment, so a suite that left it alone would assert nothing.
 */
import { assertModuleConfig } from '@kernel/module-config';
import { createOrderBodyItemsMax, createOrderBodyItemsItemQuantityMax } from '@api/schemas.zod';
import {
    maxAdminOrderLines,
    maxAdminOrderLineQuantity,
    orderFrontendLink,
    withdrawalPeriodDays
} from '../../config';
import ordersModule from '../../module';
import { withoutEnvironmentInThisFile, setEnvironment } from '@tests/environment';

/** The required identity variables, each with a value that satisfies its rule. */
const IDENTITY = {
    NODE_SHOP_LEGAL_NAME: 'Guebbit Demo Shop Srl',
    NODE_SHOP_STREET: 'Via Roma 1',
    NODE_SHOP_CITY: 'Milano',
    NODE_SHOP_ZIP: '20100',
    NODE_SHOP_EMAIL: 'shop@example.com',
    NODE_SHOP_PHONE: '+39 02 1234567'
} as const;

/** The names of {@link IDENTITY}, in declaration order. */
const IDENTITY_VARIABLES = Object.keys(IDENTITY) as (keyof typeof IDENTITY)[]; // `as`: Object.keys is string[]

/** Every variable this gate reads, cleared before each case and put back after the file. */
const TOUCHED = [
    'NODE_ENV',
    'NODE_URL',
    'NODE_SHOP_COUNTRY',
    'NODE_SHOP_TIMEZONE',
    ...IDENTITY_VARIABLES,
    'NODE_SHOP_VAT_NUMBER',
    'NODE_RETURN_ADDRESS_NAME',
    'NODE_RETURN_ADDRESS_STREET',
    'NODE_RETURN_ADDRESS_CITY',
    'NODE_RETURN_ADDRESS_ZIP',
    'NODE_RETURN_ADDRESS_COUNTRY',
    'NODE_RETURN_POSTAGE_PAYER',
    'NODE_SHIP_TO_COUNTRIES',
    'NODE_ADMIN_ORDER_MAX_LINES',
    'NODE_ADMIN_ORDER_MAX_LINE_QUANTITY',
    'NODE_FRONTEND_LINK_ORDER',
    'NODE_FRONTEND_URL',
    'NODE_WITHDRAWAL_PERIOD_DAYS',
    'NODE_DEFAULT_CURRENCY'
] as const;

withoutEnvironmentInThisFile(TOUCHED);

/** A deployment that satisfies every check, for a case to break one thing in. */
const configure = (): void => {
    setEnvironment({ NODE_ENV: 'development' });
    setEnvironment({ NODE_URL: 'https://api.example.com/' });
    setEnvironment({ NODE_SHOP_COUNTRY: 'IT' });
    setEnvironment({ NODE_SHOP_TIMEZONE: 'Europe/Rome' });
    setEnvironment(IDENTITY);
};

describe('the admin order limits', () => {
    it('default to 100 lines and 99999 units a line', () => {
        expect(maxAdminOrderLines()).toBe(100);
        expect(maxAdminOrderLineQuantity()).toBe(99_999);
    });

    it('read NODE_ADMIN_ORDER_MAX_LINES and NODE_ADMIN_ORDER_MAX_LINE_QUANTITY when set', () => {
        setEnvironment({
            NODE_ADMIN_ORDER_MAX_LINES: '7',
            NODE_ADMIN_ORDER_MAX_LINE_QUANTITY: '12'
        });
        expect(maxAdminOrderLines()).toBe(7);
        expect(maxAdminOrderLineQuantity()).toBe(12);
    });

    // The schema is the promise; an env value above it must not widen it.
    it('never exceed the contract ceiling', () => {
        setEnvironment({
            NODE_ADMIN_ORDER_MAX_LINES: '5000',
            NODE_ADMIN_ORDER_MAX_LINE_QUANTITY: '99999999'
        });
        expect(maxAdminOrderLines()).toBe(createOrderBodyItemsMax);
        expect(maxAdminOrderLineQuantity()).toBe(createOrderBodyItemsItemQuantityMax);
    });

    it('refuse a limit below 1', () => {
        setEnvironment({ NODE_ADMIN_ORDER_MAX_LINES: '0' });
        expect(() => maxAdminOrderLines()).toThrow();
    });
});

/**
 * `orderFrontendLink` — this module's own D14 fix: `infrastructure/http/frontend-link.ts` only
 * turns a resolved template into a URL, so the default template and its env-var override live
 * here, not in infrastructure.
 */
describe('orderFrontendLink', () => {
    it('builds the order link off the default template, id in the path, no query string', () => {
        expect(orderFrontendLink({ locale: 'en', id: 'order-1' })).toBe(
            'http://localhost:8080/en/orders/order-1'
        );
    });

    it('lets a deployment override the template without touching account links', () => {
        setEnvironment({ NODE_FRONTEND_LINK_ORDER: 'my-orders/{id}/details' });

        expect(orderFrontendLink({ locale: 'en', id: 'order-1' })).toBe(
            'http://localhost:8080/en/my-orders/order-1/details'
        );
    });

    it('URL-encodes the id', () => {
        expect(orderFrontendLink({ locale: 'en', id: 'order 1/2' })).toBe(
            'http://localhost:8080/en/orders/order%201%2F2'
        );
    });
});

describe('the withdrawal period', () => {
    it('reads 30 when unset', () => {
        expect(withdrawalPeriodDays()).toBe(30);
    });

    it('refuses 20 at boot: less than the law plus the longest roll-over', () => {
        configure();
        setEnvironment({ NODE_WITHDRAWAL_PERIOD_DAYS: '20' });

        expect(() => assertModuleConfig([ordersModule], [])).toThrow(/NODE_WITHDRAWAL_PERIOD_DAYS/);
    });

    it('accepts 21 at boot and reads it back', () => {
        configure();
        setEnvironment({ NODE_WITHDRAWAL_PERIOD_DAYS: '21' });

        expect(() => assertModuleConfig([ordersModule], [])).not.toThrow();
        expect(withdrawalPeriodDays()).toBe(21);
    });
});
