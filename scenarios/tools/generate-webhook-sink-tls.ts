#!/usr/bin/env tsx
/**
 * @module
 * Remake the demo webhook sink's TLS fixtures — `npm run scenario:tls`.
 *
 * Writes three files into `scenarios/support/tls/`:
 *
 *   webhook-sink-ca.pem    the test CA's certificate (what `NODE_EXTRA_CA_CERTS` points at)
 *   webhook-sink-cert.pem  the sink's leaf certificate, signed by that CA
 *   webhook-sink-key.pem   the leaf's private key (public on purpose, see below)
 *
 * The CA's own private key is generated, used once and thrown away, so nobody can mint another
 * certificate under it. The CA is also name-constrained to loopback and the two local sink names,
 * so even a trusted copy of it cannot vouch for a real host.
 *
 * Authoring-time tool: shells out to the `openssl` CLI (Node's `node:crypto` cannot build X.509),
 * and its output is committed, so no run ever needs `openssl`. Remake when the ten years run out;
 * `tests/unit/scenarios/webhook-sink-tls.test.ts` fails a month before that.
 *
 * After remaking: `npm run sync:frontend`. The frontend's Cypress sink serves the same pair.
 *
 * See: docs/modules/webhooks.md#https-in-the-demo
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Where the committed fixtures live. */
const TLS_DIRECTORY = path.join(__dirname, '../support/tls');

/** Ten years, in days: the shared lifetime of the CA and the leaf. */
const VALIDITY_DAYS = '3650';

/** The names the leaf answers to: loopback, and the compose proxy's service name. */
const LEAF_ALT_NAMES = 'IP:127.0.0.1, DNS:localhost, DNS:webhook-tester-tls';

/** The CA's certificate request: a name-constrained, path-length-0 root that can sign only a leaf. */
const CA_CONFIG = `[req]
distinguished_name = dn
x509_extensions = v3_ca
prompt = no
[dn]
CN = Guebbit demo webhook sink test CA
[v3_ca]
basicConstraints = critical, CA:TRUE, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
nameConstraints = critical, permitted;IP:127.0.0.0/255.0.0.0, permitted;DNS:localhost, permitted;DNS:webhook-tester-tls
`;

/** The leaf's certificate request and the extensions the CA signs onto it. */
const LEAF_CONFIG = `[req]
distinguished_name = dn
prompt = no
[dn]
CN = 127.0.0.1
[v3_leaf]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature
extendedKeyUsage = serverAuth
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
subjectAltName = ${LEAF_ALT_NAMES}
`;

/**
 * Run one `openssl` subcommand in `directory`.
 * https://docs.openssl.org/3.0/man1/openssl/
 *
 * @param directory - the scratch directory every file name below is relative to
 * @param argv - the subcommand and its flags
 */
const openssl = (directory: string, argv: string[]): void => {
    execFileSync('openssl', argv, { cwd: directory, stdio: 'inherit' });
};

/**
 * Build the CA and the leaf in a scratch directory, copy the three public files out, and delete
 * the scratch directory (and with it the CA's private key).
 */
const remake = (): void => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'webhook-sink-tls-'));
    try {
        writeFileSync(path.join(scratch, 'ca.cnf'), CA_CONFIG);
        writeFileSync(path.join(scratch, 'leaf.cnf'), LEAF_CONFIG);

        // `ecparam -genkey`: an ECDSA P-256 private key; `-noout` skips printing the curve parameters.
        openssl(scratch, [
            'ecparam',
            '-name',
            'prime256v1',
            '-genkey',
            '-noout',
            '-out',
            'ca-key.pem'
        ]);
        // `req -x509`: a self-signed certificate straight from the key, no CSR round trip.
        openssl(scratch, [
            'req',
            '-x509',
            '-new',
            '-key',
            'ca-key.pem',
            '-days',
            VALIDITY_DAYS,
            '-config',
            'ca.cnf',
            '-out',
            'ca.pem'
        ]);
        openssl(scratch, [
            'ecparam',
            '-name',
            'prime256v1',
            '-genkey',
            '-noout',
            '-out',
            'leaf-key.pem'
        ]);
        openssl(scratch, [
            'req',
            '-new',
            '-key',
            'leaf-key.pem',
            '-config',
            'leaf.cnf',
            '-out',
            'leaf.csr'
        ]);
        // `x509 -req`: the CA signs the CSR; `-CAcreateserial` mints a random serial number.
        openssl(scratch, [
            'x509',
            '-req',
            '-in',
            'leaf.csr',
            '-CA',
            'ca.pem',
            '-CAkey',
            'ca-key.pem',
            '-CAcreateserial',
            '-days',
            VALIDITY_DAYS,
            '-extfile',
            'leaf.cnf',
            '-extensions',
            'v3_leaf',
            '-out',
            'leaf.pem'
        ]);
        // `verify`: refuses to go on unless the leaf chains to the CA and covers loopback.
        openssl(scratch, ['verify', '-CAfile', 'ca.pem', '-verify_ip', '127.0.0.1', 'leaf.pem']);

        copyFileSync(path.join(scratch, 'ca.pem'), path.join(TLS_DIRECTORY, 'webhook-sink-ca.pem'));
        copyFileSync(
            path.join(scratch, 'leaf.pem'),
            path.join(TLS_DIRECTORY, 'webhook-sink-cert.pem')
        );
        copyFileSync(
            path.join(scratch, 'leaf-key.pem'),
            path.join(TLS_DIRECTORY, 'webhook-sink-key.pem')
        );
    } finally {
        // Always: the scratch directory holds the CA's private key.
        rmSync(scratch, { recursive: true, force: true });
    }
};

/** Remake the fixtures, then say where they went. */
remake();
console.info(`[tls] Remade the webhook sink fixtures in ${TLS_DIRECTORY}.`);
