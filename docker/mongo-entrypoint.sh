#!/usr/bin/env bash
# Wraps the official image's own entrypoint so the replica set's keyFile and the wire-TLS
# certificates exist, with the right ownership, before mongod ever reads them — one script rather
# than a separate one-shot service, so nothing but `database` itself needs to depend on it. (An
# earlier version used a sibling one-shot service instead; podman-compose 1.6/libpod refuses to
# start anything that transitively requires an already-exited container, which broke every
# service two levels below it. A wrapper avoids the dependency chain entirely, and is simpler
# besides.)
#
# Runs as this container's default user, root — before `docker-entrypoint.sh` drops to the image's
# `mongodb` user (uid/gid 999) via `gosu` for the actual mongod process. That's exactly the
# privilege this script needs: `chown` to a uid this shell isn't running as.
set -euo pipefail

KEYFILE=/keyfile-dir/mongo-keyfile

if [ ! -s "$KEYFILE" ]; then
    openssl rand -base64 756 > "$KEYFILE"
    chmod 400 "$KEYFILE"
    chown 999:999 "$KEYFILE"
fi

# Wire TLS: a self-signed CA minted once, first-boot-only, same pattern as the keyFile above.
# `docker-compose.production.yml`'s `mongod` command reads $SERVER_PEM as its own identity
# (`--tlsCertificateKeyFile`) — deliberately WITHOUT `--tlsCAFile` on the server side, so mongod
# never asks a connecting client for a certificate back (mTLS is a heavier control than this
# deployment needs; see DB_SECURITY_1_WIRE_TLS.md, Option A vs C). Only the CLIENT side verifies
# the server: `NODE_DB_URI`'s `tlsCAFile` and every `mongosh`/`mongodump` invocation below (the
# healthcheck, `mongo-rs-init`, `docs/tools/backups.md`'s dump command) point at $CA_CERT or the
# copy this script hands to `mongo-ca-dir` for the containers that never mount this volume.
#
# A deployment bringing a real CA-issued certificate instead: drop it in as $SERVER_PEM (cert then
# key, concatenated, matching MongoDB's own `tlsCertificateKeyFile` format) and the CA's public
# cert as $CA_CERT before first boot — this block only runs while $SERVER_PEM is still absent.
CA_KEY=/keyfile-dir/mongo-ca.key
CA_CERT=/keyfile-dir/mongo-ca.crt
CA_SERIAL=/keyfile-dir/mongo-ca.srl
SERVER_PEM=/keyfile-dir/mongo-server.pem
SHARED_CA_CERT=/ca-dir/mongo-ca.crt

if [ ! -s "$SERVER_PEM" ]; then
    # `database` is the compose service name the app/tooling dial; `localhost`/127.0.0.1 cover
    # the in-container mongosh/mongodump calls (the healthcheck, mongo-rs-init, backups) that
    # connect over the loopback interface instead of the compose network.
    SUBJECT_ALT_NAME='subjectAltName=DNS:database,DNS:localhost,IP:127.0.0.1'

    # Self-signed root CA. `-nodes`: the key is written unencrypted — there is no human present at
    # boot to type a passphrase back in, same reasoning as the keyFile above carrying no password.
    openssl req -x509 -newkey rsa:4096 -keyout "$CA_KEY" -out "$CA_CERT" \
        -days 3650 -nodes -subj '/CN=boilerplate-mongo-ca'

    # The server's own key + CSR, then signed by the CA just minted above.
    openssl req -newkey rsa:4096 -keyout /tmp/mongo-server.key -out /tmp/mongo-server.csr \
        -nodes -subj '/CN=database' -addext "$SUBJECT_ALT_NAME"
    openssl x509 -req -in /tmp/mongo-server.csr -CA "$CA_CERT" -CAkey "$CA_KEY" \
        -CAcreateserial -CAserial "$CA_SERIAL" -out /tmp/mongo-server.crt -days 3650 \
        -extfile <(echo "$SUBJECT_ALT_NAME")

    # `--tlsCertificateKeyFile` wants ONE file: the cert followed by its own private key.
    # https://www.mongodb.com/docs/manual/tutorial/configure-ssl/
    cat /tmp/mongo-server.key /tmp/mongo-server.crt > "$SERVER_PEM"
    rm -f /tmp/mongo-server.key /tmp/mongo-server.csr /tmp/mongo-server.crt

    chmod 400 "$SERVER_PEM" "$CA_KEY"
    chown 999:999 "$SERVER_PEM" "$CA_KEY"
fi

# The CA cert (not the key) is the only half `app`/`cron`/`setup`/`mongo-rs-init` need, to verify
# mongod's certificate — copied out to the volume shared with them rather than handing any of
# those containers the whole `/keyfile-dir` the keyFile and private keys also live in. Re-copied
# every boot: idempotent, and covers a `/ca-dir` volume recreated on its own without `/keyfile-dir`.
mkdir -p /ca-dir
cp "$CA_CERT" "$SHARED_CA_CERT"
chmod 444 "$CA_CERT" "$SHARED_CA_CERT"

exec docker-entrypoint.sh "$@"
