/**
 * @module
 * The operator's identity: read live off `NODE_LEGAL_*`, the optional fields only when set, the
 * support address standing in for an unset legal email, and boot refusing a missing name or
 * postal address. Pure env reads, so the unit suite is enough.
 *
 * Driven through `assertModuleConfig` for the boot half, which short-circuits under
 * `NODE_ENV=test`, so each such case sets `NODE_ENV` away from it first.
 */
import { assertModuleConfig } from '@kernel/module-config';
import accountModule from '../../module';
import { withoutEnvironmentInThisFile, setEnvironment } from '@tests/environment';
import { operatorIdentity } from '../../services';

/** The variables an operator must set, each with a value that satisfies its rule. */
const REQUIRED = {
    NODE_LEGAL_NAME: 'Guebbit Demo Shop Srl',
    NODE_LEGAL_STREET: 'Via Roma 1',
    NODE_LEGAL_CITY: 'Milano',
    NODE_LEGAL_ZIP: '20100',
    NODE_LEGAL_COUNTRY: 'IT'
} as const;

/** The names of {@link REQUIRED}, in declaration order. */
const REQUIRED_VARIABLES = Object.keys(REQUIRED) as (keyof typeof REQUIRED)[]; // `as`: Object.keys is string[]

withoutEnvironmentInThisFile([
    ...REQUIRED_VARIABLES,
    'NODE_LEGAL_PHONE',
    'NODE_LEGAL_VAT_NUMBER',
    'NODE_LEGAL_TRADE_REGISTER',
    'NODE_LEGAL_REGISTRATION_NUMBER',
    'NODE_LEGAL_EMAIL',
    'NODE_SUPPORT_EMAIL'
] as const);

describe('the operator boot gate', () => {
    it.each(REQUIRED_VARIABLES)('refuses to boot with no %s', (name) => {
        setEnvironment({ NODE_ENV: 'development' });
        setEnvironment(REQUIRED);
        setEnvironment({ [name]: undefined });

        expect(() => assertModuleConfig([accountModule], [])).toThrow(new RegExp(name));
    });

    it('boots with no phone: the site does not need one', () => {
        setEnvironment({ NODE_ENV: 'development' });
        setEnvironment(REQUIRED);

        expect(() => assertModuleConfig([accountModule], [])).not.toThrow(/NODE_LEGAL/);
    });
});

describe('operatorIdentity', () => {
    it('reads the required fields, leaving every optional one out when unset', () => {
        setEnvironment(REQUIRED);
        setEnvironment({ NODE_SUPPORT_EMAIL: 'support@example.com' });

        expect(operatorIdentity()).toEqual({
            legalName: 'Guebbit Demo Shop Srl',
            street: 'Via Roma 1',
            city: 'Milano',
            zip: '20100',
            country: 'IT',
            email: 'support@example.com'
        });
    });

    it('carries the optional fields when set, and NODE_LEGAL_EMAIL over the support address', () => {
        setEnvironment(REQUIRED);
        setEnvironment({
            NODE_SUPPORT_EMAIL: 'support@example.com',
            NODE_LEGAL_EMAIL: 'legal@example.com',
            NODE_LEGAL_PHONE: '+39 02 1234567',
            NODE_LEGAL_VAT_NUMBER: 'IT12345678901',
            NODE_LEGAL_TRADE_REGISTER: 'Registro Imprese di Bologna',
            NODE_LEGAL_REGISTRATION_NUMBER: 'BO-123456'
        });

        expect(operatorIdentity()).toMatchObject({
            email: 'legal@example.com',
            phone: '+39 02 1234567',
            vatNumber: 'IT12345678901',
            tradeRegister: 'Registro Imprese di Bologna',
            registrationNumber: 'BO-123456'
        });
    });

    it('refuses to answer with a required field unset, rather than print an empty notice', () => {
        setEnvironment(REQUIRED);
        setEnvironment({ NODE_LEGAL_CITY: undefined });

        expect(() => operatorIdentity()).toThrow(/NODE_LEGAL_CITY/);
    });
});
