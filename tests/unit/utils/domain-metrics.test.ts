/**
 * Unit tests for src/utils/domain-metrics.ts (Phase 2)
 *
 * Verifies that each domain counter is registered in the prom-client
 * registry and that incrementing it produces the expected output line.
 */

import {
    loginSuccessTotal,
    loginFailureTotal,
    signupTotal,
    checkoutSuccessTotal,
    checkoutFailureTotal,
    orderCreatedTotal
} from '@utils/domain-metrics';
import { getPrometheusMetrics } from '@utils/observability';

describe('domain-metrics', () => {
    it('auth_login_success_total increments and appears in metrics output', async () => {
        loginSuccessTotal.inc();
        const output = await getPrometheusMetrics();
        expect(output).toContain('# HELP auth_login_success_total');
        expect(output).toMatch(/auth_login_success_total \d+/);
    });

    it('auth_login_failure_total increments and appears in metrics output', async () => {
        loginFailureTotal.inc();
        const output = await getPrometheusMetrics();
        expect(output).toContain('# HELP auth_login_failure_total');
        expect(output).toMatch(/auth_login_failure_total \d+/);
    });

    it('auth_signup_total increments and appears in metrics output', async () => {
        signupTotal.inc();
        const output = await getPrometheusMetrics();
        expect(output).toContain('# HELP auth_signup_total');
        expect(output).toMatch(/auth_signup_total \d+/);
    });

    it('cart_checkout_success_total increments and appears in metrics output', async () => {
        checkoutSuccessTotal.inc();
        const output = await getPrometheusMetrics();
        expect(output).toContain('# HELP cart_checkout_success_total');
        expect(output).toMatch(/cart_checkout_success_total \d+/);
    });

    it('cart_checkout_failure_total increments and appears in metrics output', async () => {
        checkoutFailureTotal.inc();
        const output = await getPrometheusMetrics();
        expect(output).toContain('# HELP cart_checkout_failure_total');
        expect(output).toMatch(/cart_checkout_failure_total \d+/);
    });

    it('order_created_total increments and appears in metrics output', async () => {
        orderCreatedTotal.inc();
        const output = await getPrometheusMetrics();
        expect(output).toContain('# HELP order_created_total');
        expect(output).toMatch(/order_created_total \d+/);
    });

    it('mongodb_query_duration_milliseconds histogram is registered', async () => {
        const output = await getPrometheusMetrics();
        expect(output).toContain('# HELP mongodb_query_duration_milliseconds');
    });

    it('mongodb_queries_total counter is registered', async () => {
        const output = await getPrometheusMetrics();
        expect(output).toContain('# HELP mongodb_queries_total');
    });
});
