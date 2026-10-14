import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import {
    readRemovedMetrics,
    stripAlertRules
} from '../../../../scripts/scaffold/demo-remove-alert-rules';

/** A throwaway repo root holding two modules' metrics and the two rule files. */
let root: string;

/**
 * Write a file under the throwaway root, creating its folder.
 * @param relative - path from the root
 * @param content - the file's text
 */
const write = (relative: string, content: string): void => {
    const full = path.join(root, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
};

/**
 * Read a file back from the throwaway root.
 * @param relative - path from the root
 */
const read = (relative: string): string => readFileSync(path.join(root, relative), 'utf8');

/** The rule file: one group with a kept and a dropped rule, one group holding only a dropped rule. */
const RULES = `groups:
    - name: api.rules
      rules:
          # Kept: a foundation counter.
          - alert: LoginFailures
            expr: increase(auth_login_total[5m]) > 0
            labels:
                severity: warning

          # Dropped: only the shop registers this.
          - alert: PaymentMismatch
            expr: increase(payment_mismatch_total[15m]) > 0
            labels:
                severity: critical

    # A group the strip empties.
    - name: shop.rules
      rules:
          - alert: OrdersStuck
            expr: orders_stuck_total > 0
`;

/** One promtool case per alert. */
const RULE_TESTS = `rule_files:
    - prometheus.alert-rules.yaml
tests:
    - interval: 1m
      alert_rule_test:
          - alertname: LoginFailures
    # Quiet: the mismatch stays silent at zero.
    - interval: 1m
      alert_rule_test:
          - alertname: PaymentMismatch
    - interval: 1m
      alert_rule_test:
          - alertname: OrdersStuck
`;

beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'demo-remove-alert-rules-'));
    write('src/modules/account/metrics.ts', "counter({ name: 'auth_login_total' });\n");
    write(
        'src/modules/payments/metrics.ts',
        "counter({ name: 'payment_mismatch_total' });\ncounter({ name: 'auth_login_total' });\n"
    );
    write('src/modules/orders/metrics.ts', "gauge({ name: 'orders_stuck_total' });\n");
    write('src/modules/orders/tests/doubles.ts', "counter({ name: 'orders_double_total' });\n");
    write('docker/observability/prometheus.alert-rules.yaml', RULES);
    write('docker/observability/prometheus.alert-rules.test.yaml', RULE_TESTS);
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('readRemovedMetrics', () => {
    it('finds what only the removed modules register, test files aside', () => {
        expect([...readRemovedMetrics(root, ['payments', 'orders'])].toSorted()).toEqual([
            'orders_stuck_total',
            'payment_mismatch_total'
        ]);
    });
});

describe('stripAlertRules', () => {
    it('drops each rule on a removed metric, an emptied group, and their cases', () => {
        const notes = stripAlertRules(root, readRemovedMetrics(root, ['payments', 'orders']));

        const rules = parse(read('docker/observability/prometheus.alert-rules.yaml')) as {
            groups: { name: string; rules: { alert: string }[] }[];
        };
        expect(rules.groups).toEqual([
            expect.objectContaining({
                name: 'api.rules',
                rules: [expect.objectContaining({ alert: 'LoginFailures' })]
            })
        ]);
        expect(read('docker/observability/prometheus.alert-rules.yaml')).toContain(
            '# Kept: a foundation counter.'
        );
        expect(read('docker/observability/prometheus.alert-rules.yaml')).not.toContain('Dropped:');

        const cases = parse(read('docker/observability/prometheus.alert-rules.test.yaml')) as {
            tests: { alert_rule_test: { alertname: string }[] }[];
        };
        expect(
            cases.tests.flatMap((one) => one.alert_rule_test.map((each) => each.alertname))
        ).toEqual(['LoginFailures']);
        expect(notes).toHaveLength(2);
    });

    it('leaves both files untouched when no removed metric has a rule', () => {
        expect(stripAlertRules(root, new Set(['orders_double_total']))).toEqual([]);
        expect(stripAlertRules(root, new Set())).toEqual([]);

        expect(read('docker/observability/prometheus.alert-rules.yaml')).toBe(RULES);
        expect(read('docker/observability/prometheus.alert-rules.test.yaml')).toBe(RULE_TESTS);
    });
});
