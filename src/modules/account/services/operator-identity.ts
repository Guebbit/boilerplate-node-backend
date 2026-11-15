/**
 * @module
 * Who runs the site, read live off `accountConfig`: the provider identity a visitor is entitled to
 * (e-Commerce Directive Art. 5(1), GDPR Art. 13(1)(a)). `GET /config` publishes it; `invoicing` and
 * `orders` print it. Owned here, not by `shop`: a site without the shop still has an operator.
 *
 * @see docs/modules/account.md
 */

import { ConfigError } from '@infrastructure/config/define';
import { supportEmail } from '@infrastructure/adapters/config';
import type { Operator } from '@types';
import { accountConfig } from '../config';

/**
 * A required variable's value. `NODE_ENV=test` skips the boot check, so a suite that forgot to
 * set one gets this refusal instead of a silent `undefined` on a legal notice.
 * @param name - the variable, for the message
 * @param value - what the slice parsed
 * @returns the value
 * @throws {ConfigError} when it is unset
 */
const requiredValue = (name: string, value: string | undefined): string => {
    if (value === undefined)
        throw new ConfigError(`Invalid configuration (account): ${name} is required`);
    return value;
};

/**
 * The operator's identity: every required field present, the optional ones only when set.
 * @returns the identity, as `GET /config` publishes it
 * @throws {ConfigError} when a required variable is unset (only possible under `NODE_ENV=test`)
 */
export const operatorIdentity = (): Operator => {
    const config = accountConfig();
    const vatNumber = config.NODE_LEGAL_VAT_NUMBER;
    const tradeRegister = config.NODE_LEGAL_TRADE_REGISTER;
    const registrationNumber = config.NODE_LEGAL_REGISTRATION_NUMBER;
    const phone = config.NODE_LEGAL_PHONE;
    return {
        legalName: requiredValue('NODE_LEGAL_NAME', config.NODE_LEGAL_NAME),
        ...(vatNumber ? { vatNumber } : {}),
        ...(tradeRegister ? { tradeRegister } : {}),
        ...(registrationNumber ? { registrationNumber } : {}),
        street: requiredValue('NODE_LEGAL_STREET', config.NODE_LEGAL_STREET),
        city: requiredValue('NODE_LEGAL_CITY', config.NODE_LEGAL_CITY),
        zip: requiredValue('NODE_LEGAL_ZIP', config.NODE_LEGAL_ZIP),
        country: requiredValue('NODE_LEGAL_COUNTRY', config.NODE_LEGAL_COUNTRY),
        email: config.NODE_LEGAL_EMAIL ?? supportEmail(),
        ...(phone ? { phone } : {})
    };
};
