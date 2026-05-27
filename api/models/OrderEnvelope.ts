/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Order } from './Order';
import type { SuccessEnvelope } from './SuccessEnvelope';
export type OrderEnvelope = (SuccessEnvelope & {
    data: Order;
});

