#!/usr/bin/env bash
# End-to-end proof of the backup system, with plain `docker run` (no compose, no host ports):
#   1. a real replica-set Mongo, started the way docker-compose.production.yml starts `database`
#      (keyFile, TLS, the `backup` role created by docker/mongo-init.js), seeded with data
#   2. the backup image backs it up into a local-disk repository: dump, counts, files
#   3. a second run after a small change: restic deduplicates (the second run stores little)
#   4. the restore drill restores into a throwaway Mongo and compares the counts
#   5. a damaged repository makes the drill fail
#   6. the second-machine kit (rclone append-only server): backup accepted, `forget` refused,
#      the maintenance job prunes on the server's own disk
# Everything runs on one private `--internal` network; nothing publishes a port. Leaves nothing behind.
# Run it: `npm run backup:drill` (CI: the `backup-drill` job). Docs: docs/tools/backups.md#the-restore-drill
set -euo pipefail

cd "$(dirname "$0")/../.."
ROOT="$PWD"
ID="bdrill$$"
NET="$ID"
TMP="$(mktemp -d)"
IMAGE="${BACKUP_DRILL_IMAGE:-boilerplate-backup:drill}"
# The same pinned images the compose files use.
MONGO_IMAGE="$(sed -n -E "s/^ +image: (docker.io\/library\/mongo:8@sha256:[0-9a-f]+).*/\1/p" docker-compose.production.yml | head -1)"
RCLONE_IMAGE="$(sed -n -E 's/^ +image: (docker.io\/rclone\/rclone:[^ ]+).*/\1/p' docker-compose.backup-server.yml | head -1)"
GATUS_IMAGE="${BACKUP_DRILL_GATUS_IMAGE:-docker.io/twinproduction/gatus:v5.37.0}"
PASS=0
# Extra `docker run` flags for `backup_image` (none by default).
EXTRA=()

# Prints a step heading.
step() { printf '\n=== %s\n' "$*"; }

# Fails the drill with a message.
die() { printf 'BACKUP DRILL FAILED: %s\n' "$*" >&2; exit 1; }

# Removes every container, volume and the network, whatever happened.
cleanup() {
    local code=$?
    if [ -n "${BACKUP_DRILL_KEEP:-}" ]; then echo "kept: label $ID, tmp $TMP"; return; fi
    docker ps -aq --filter "label=$ID" | xargs -r docker rm -f >/dev/null 2>&1 || true
    docker volume ls -q --filter "label=$ID" | xargs -r docker volume rm -f >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
    rm -rf "$TMP"
    if [ "$code" -eq 0 ] && [ "$PASS" -eq 1 ]; then echo "BACKUP DRILL PASSED"; else echo "BACKUP DRILL DID NOT PASS (exit $code)" >&2; fi
    exit "$code"
}
trap cleanup EXIT

# `docker run` with this drill's label, so `cleanup` finds it.
run() { docker run --label "$ID" "$@"; }

# Creates a labelled volume.
volume() { docker volume create --label "$ID" "$1" >/dev/null; }

# The backup image, running one of its scripts once, the way the `backup` service runs it.
backup_image() {
    local script="$1"
    shift
    run --rm "${EXTRA[@]}" --network "$NET" --user 1000:1000 --read-only --cap-drop ALL \
        --tmpfs /tmp:mode=1777,size=256m \
        -v "$TMP/secrets/restic_password:/run/secrets/restic_password:ro" \
        -v "$TMP/secrets/mongo_backup_password:/run/secrets/mongo_backup_password:ro" \
        -v "$ID-ca:/ca-dir:ro" -v "$ID-uploads:/data/uploads:ro" -v "$ID-storage:/data/storage:ro" \
        -v "$ID-cache:/cache" -v "$ID-repo:/repo" \
        -e BACKUP_HOST=drill -e BACKUP_REPOSITORY="${BACKUP_REPOSITORY:-/repo}" \
        -e BACKUP_HEARTBEAT_URL="${BACKUP_HEARTBEAT_URL:-}" \
        --entrypoint "$script" "$IMAGE" "$@"
}

# Bytes restic has stored in the repository, after deduplication and compression.
raw_size() {
    backup_image bash -c 'source /usr/local/lib/backup/common.sh; restic stats --mode raw-data --json' \
        | sed -n -E 's/.*"total_size":([0-9]+).*/\1/p'
}

# Root-credentialed mongosh inside the database container.
mongosh_root() {
    docker exec "$ID-database" mongosh --quiet --tls --tlsCAFile /ca-dir/mongo-ca.crt \
        -u root -p "$(cat "$TMP/secrets/mongo_root_password")" --authenticationDatabase admin --eval "$1"
}

step "build the backup image"
docker build -q -f docker/Dockerfile.backup -t "$IMAGE" . >/dev/null

step "secrets and network"
mkdir -p "$TMP/secrets"
for name in mongo_root_password mongo_app_password mongo_backup_password restic_password; do
    openssl rand -hex 32 >"$TMP/secrets/$name"
    chmod 0644 "$TMP/secrets/$name"
done
chmod 0755 "$TMP" "$TMP/secrets"
docker network create --internal --label "$ID" "$NET" >/dev/null
for v in mongo-data keyfile ca repo cache uploads storage; do volume "$ID-$v"; done

step "a replica-set Mongo, as docker-compose.production.yml starts it"
run -d --name "$ID-database" --network "$NET" --network-alias database \
    --cap-drop ALL --cap-add CHOWN --cap-add SETUID --cap-add SETGID --cap-add DAC_OVERRIDE --cap-add FOWNER \
    --entrypoint bash \
    -e MONGO_INITDB_ROOT_USERNAME=root -e MONGO_INITDB_ROOT_PASSWORD_FILE=/run/secrets/mongo_root_password \
    -e MONGO_INITDB_DATABASE=api -e MONGO_APP_USER=api -e MONGO_APP_PASSWORD_FILE=/run/secrets/mongo_app_password \
    -e MONGO_BACKUP_USER=backup -e MONGO_BACKUP_PASSWORD_FILE=/run/secrets/mongo_backup_password \
    -v "$TMP/secrets/mongo_root_password:/run/secrets/mongo_root_password:ro" \
    -v "$TMP/secrets/mongo_app_password:/run/secrets/mongo_app_password:ro" \
    -v "$TMP/secrets/mongo_backup_password:/run/secrets/mongo_backup_password:ro" \
    -v "$ID-mongo-data:/data/db" -v "$ID-keyfile:/keyfile-dir" -v "$ID-ca:/ca-dir" \
    -v "$ROOT/docker/mongo-entrypoint.sh:/mongo-entrypoint.sh:ro" \
    -v "$ROOT/docker/mongo-init.js:/docker-entrypoint-initdb.d/mongo-init.js:ro" \
    "$MONGO_IMAGE" /mongo-entrypoint.sh mongod --replSet rs0 --keyFile /keyfile-dir/mongo-keyfile --bind_ip_all \
    --noscripting --tlsMode requireTLS --tlsCertificateKeyFile /keyfile-dir/mongo-server.pem \
    --tlsCAFile /keyfile-dir/mongo-ca.crt --tlsAllowConnectionsWithoutCertificates >/dev/null
for _ in $(seq 1 90); do
    docker exec "$ID-database" mongosh --quiet --tls --tlsCAFile /keyfile-dir/mongo-ca.crt \
        --eval "db.adminCommand('ping').ok" >/dev/null 2>&1 && break
    sleep 2
done
run --rm --network "$NET" --entrypoint bash -e MONGO_ROOT_USER=root \
    -v "$TMP/secrets/mongo_root_password:/run/secrets/mongo_root_password:ro" \
    -v "$ID-ca:/ca-dir:ro" -v "$ROOT/docker/mongo-rs-init.sh:/mongo-rs-init.sh:ro" \
    "$MONGO_IMAGE" /mongo-rs-init.sh

step "seed: three collections, an upload, a queued mail"
seed='
    const words = () => Array.from({ length: 40 }, () => Math.random().toString(36).slice(2)).join(" ");
    const target = db.getSiblingDB("api");
    for (const name of ["users", "orders", "products"]) {
        const rows = Array.from({ length: 4000 }, (_, i) => ({ n: i, text: words() }));
        target.getCollection(name).insertMany(rows);
    }
    print("seeded " + ["users", "orders", "products"].map((n) => n + "=" + target.getCollection(n).countDocuments()).join(" "));
'
mongosh_root "$seed"
run --rm --user 0 --entrypoint bash -v "$ID-uploads:/u" -v "$ID-storage:/s" "$IMAGE" -c '
    head -c 2000000 /dev/urandom > /u/photo.jpg
    mkdir -p /s/mail-spool /s/documents
    echo "queued mail" > /s/mail-spool/1.eml
    echo "regenerable" > /s/documents/invoice.pdf
    chown -R 1000:1000 /u /s'

step 'backup 1 (the backup role, TLS, no gzip, into a local repository)'
backup_image backup-job
raw1="$(raw_size)"
echo "raw data after run 1: $raw1 bytes"

step "a small change, then backup 2, then backup 3 with nothing changed"
mongosh_root 'db.getSiblingDB("api").users.insertMany(Array.from({length: 100}, (_, i) => ({ n: 9000 + i, text: "late" })))' >/dev/null
backup_image backup-job
raw2="$(raw_size)"
# restic cuts the stream into ~1 MiB chunks, so a small change costs about the chunks it touches.
echo "raw data after run 2: $raw2 bytes (a 2.5% change added $((raw2 - raw1)))"
backup_image backup-job
raw3="$(raw_size)"
echo "raw data after run 3: $raw3 bytes (nothing changed, added $((raw3 - raw2)))"
# Unchanged data must deduplicate completely: this is what the choice of an uncompressed archive buys.
[ "$((raw3 - raw2))" -lt "$((raw1 / 20))" ] || die "an unchanged database added more than 5% of run 1: restic is not deduplicating"

# A fresh throwaway Mongo (a restored one cannot be restored into twice).
throwaway() {
    docker rm -f "$ID-throwaway" >/dev/null 2>&1 || true
    run -d --name "$ID-throwaway" --network "$NET" --network-alias restore-drill-db --tmpfs /data/db:size=2g \
        "$MONGO_IMAGE" mongod --bind_ip_all --noauth >/dev/null
}

# The restore drill, as the `restore-drill` compose service runs it. Extra `docker run` flags via EXTRA.
drill() {
    run --rm "${EXTRA[@]}" --network "$NET" --user 1000:1000 --read-only --cap-drop ALL \
        --tmpfs /tmp:mode=1777,size=256m --tmpfs /restore:mode=1777,size=512m \
        -v "$TMP/secrets/restic_password:/run/secrets/restic_password:ro" -v "$ID-cache:/cache" -v "$ID-repo:/repo" \
        -e BACKUP_HOST=drill -e BACKUP_REPOSITORY="${BACKUP_REPOSITORY:-/repo}" -e DRILL_MONGO_HOST=restore-drill-db \
        --entrypoint backup-restore-drill "$IMAGE"
}

step "the restore drill: throwaway Mongo, counts, files, repository check"
throwaway
drill

step "the heartbeat: Gatus sees a green ping after a good run and a red one after a bad run"
mkdir -p "$TMP/gatus"
cat >"$TMP/gatus/config.yaml" <<'YAML'
storage:
    type: memory
external-endpoints:
    - name: backup
      group: drill
      token: drill-token
      heartbeat:
          interval: 10m
endpoints:
    - name: placeholder
      group: drill
      url: http://127.0.0.1:1/
      interval: 1h
      conditions:
          - '[STATUS] == 200'
YAML
chmod 0644 "$TMP/gatus/config.yaml"
chmod 0755 "$TMP/gatus"
run -d --name "$ID-gatus" --network "$NET" --network-alias gatus -e GATUS_CONFIG_PATH=/config/config.yaml \
    -v "$TMP/gatus:/config:ro" "$GATUS_IMAGE" >/dev/null
for _ in $(seq 1 30); do
    run --rm --network "$NET" --entrypoint curl "$IMAGE" -fsS http://gatus:8080/health >/dev/null 2>&1 && break
    sleep 1
done
# The newest result Gatus holds for the `backup` external endpoint: `true` or `false`.
heartbeat_state() {
    run --rm --network "$NET" --entrypoint bash "$IMAGE" -c \
        "curl -fsS http://gatus:8080/api/v1/endpoints/statuses | jq -r '.[] | select(.name==\"backup\") | .results | last | .success'"
}
# Waits for the newest result to be the expected one: Gatus caches its status API for a few seconds.
expect_heartbeat() {
    for _ in $(seq 1 20); do
        [ "$(heartbeat_state)" = "$1" ] && return 0
        sleep 1
    done
    die "Gatus did not record success=$1"
}
BACKUP_HEARTBEAT_URL='http://gatus:8080/api/v1/endpoints/drill_backup/external?success=true'
export BACKUP_HEARTBEAT_URL
EXTRA=(-e BACKUP_HEARTBEAT_TOKEN=drill-token)
backup_image backup-job >/dev/null
expect_heartbeat true
echo "after a good run: success=true"
# A wrong database user makes the dump fail: the job must go red and say so.
EXTRA=(-e BACKUP_HEARTBEAT_TOKEN=drill-token -e MONGO_BACKUP_USER=nobody)
if backup_image backup-job >/dev/null 2>&1; then die "the job passed with a wrong database user"; fi
expect_heartbeat false
echo "after a failed run: success=false"
EXTRA=()
unset BACKUP_HEARTBEAT_URL

step "the scheduler: an every-minute schedule produces runs, and an empty repository stays dormant"
run -d --name "$ID-scheduled" --network "$NET" --user 1000:1000 --read-only --cap-drop ALL --tmpfs /tmp:mode=1777,size=256m \
    -v "$TMP/secrets/restic_password:/run/secrets/restic_password:ro" \
    -v "$TMP/secrets/mongo_backup_password:/run/secrets/mongo_backup_password:ro" \
    -v "$ID-ca:/ca-dir:ro" -v "$ID-uploads:/data/uploads:ro" -v "$ID-storage:/data/storage:ro" \
    -v "$ID-cache:/cache" -v "$ID-repo:/repo" \
    -e BACKUP_HOST=drill -e BACKUP_REPOSITORY=/repo -e 'BACKUP_SCHEDULE=* * * * *' "$IMAGE" >/dev/null
run -d --name "$ID-dormant" --network "$NET" --user 1000:1000 --read-only --cap-drop ALL --tmpfs /tmp:mode=1777,size=16m \
    "$IMAGE" >/dev/null
for _ in $(seq 1 80); do
    docker logs "$ID-scheduled" 2>&1 | grep -q 'backup: done' && break
    sleep 2
done
docker logs "$ID-scheduled" 2>&1 | grep -q 'backup: done' || die "the scheduled container never completed a run"
echo "scheduled run: $(docker logs "$ID-scheduled" 2>&1 | grep 'backup: done' | head -1)"
for name in scheduled dormant; do
    docker exec "$ID-$name" curl -fsS http://127.0.0.1:9746/health >/dev/null || die "$name container is not healthy"
done
docker logs "$ID-dormant" 2>&1 | grep -qi 'fail\|error' && die "the dormant container logged an error"
echo "both containers answer /health; the dormant one ran nothing"
docker rm -f "$ID-scheduled" "$ID-dormant" "$ID-gatus" >/dev/null

step "a damaged repository must fail the drill"
run --rm --user 0 --entrypoint bash -v "$ID-repo:/repo" "$IMAGE" -c 'f=$(find /repo/data -type f | head -1); rm "$f"'
throwaway
EXTRA=(-e DRILL_CHECK_SUBSET=100%)
if drill >"$TMP/damaged.log" 2>&1; then
    cat "$TMP/damaged.log"
    die "the drill passed on a damaged repository"
fi
EXTRA=()
tail -n 3 "$TMP/damaged.log"

step "the second machine: append-only server, refused forget, upkeep on its own disk"
mkdir -p "$TMP/server/clients/acme"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=backup-server -addext subjectAltName=DNS:backup-server \
    -keyout "$TMP/server/tls.key" -out "$TMP/server/tls.crt" 2>/dev/null
printf 'acme:%s\n' "$(openssl passwd -apr1 clientpass)" >"$TMP/server/htpasswd"
cp "$TMP/secrets/restic_password" "$TMP/server/clients/acme/password"
chmod -R a+rX "$TMP/server"
volume "$ID-data"
run --rm --user 0 --cap-drop ALL --cap-add CHOWN --entrypoint sh -v "$ID-data:/data" "$IMAGE" \
    -c 'mkdir -p /data/repos && chown 1000:1000 /data/repos'
# The same flags docker-compose.backup-server.yml gives the `rest` service.
run -d --name "$ID-rest" --network "$NET" --network-alias backup-server --user 1000:1000 --read-only --cap-drop ALL \
    --tmpfs /tmp:mode=1777,size=64m -e HOME=/tmp -v "$ID-data:/data" -v "$TMP/server:/run/secrets:ro" \
    "$RCLONE_IMAGE" serve restic /data/repos --addr=:8000 --append-only --private-repos --htpasswd=/run/secrets/htpasswd \
    --cert=/run/secrets/tls.crt --key=/run/secrets/tls.key --min-tls-version=tls1.2 >/dev/null
sleep 3
# The repository's login travels as a secret file, the way the compose file mounts it.
printf 'RESTIC_REST_USERNAME=acme\nRESTIC_REST_PASSWORD=clientpass\n' >"$TMP/secrets/restic_repository_env"
chmod 0644 "$TMP/secrets/restic_repository_env"
CLIENT_ENV=(-v "$TMP/server/tls.crt:/tls.crt:ro" -e RESTIC_CACERT=/tls.crt
    -v "$TMP/secrets/restic_repository_env:/run/secrets/restic_repository_env:ro")
export BACKUP_REPOSITORY=rest:https://backup-server:8000/acme/
EXTRA=("${CLIENT_ENV[@]}" -e BACKUP_PRUNE=false)
backup_image backup-job >/dev/null
backup_image backup-job >/dev/null
backup_image backup-job >/dev/null
echo "three backups accepted by the append-only server"
snapshots() { backup_image bash -c 'source /usr/local/lib/backup/common.sh; restic snapshots --json | jq length'; }
before="$(snapshots)"
EXTRA=("${CLIENT_ENV[@]}" -e BACKUP_PRUNE=true)
if backup_image backup-job >"$TMP/forget.log" 2>&1; then cat "$TMP/forget.log"; die "forget was accepted by the append-only server"; fi
grep -i -E "forbidden|403|not allowed|refus" "$TMP/forget.log" | head -2 || true
tail -n 3 "$TMP/forget.log"
EXTRA=("${CLIENT_ENV[@]}")
echo "snapshots after the refused forget: $(snapshots) (was $before plus one new backup)"
# The upkeep, on the server's own disk: keep only the newest of each kind.
run --rm --user 1000:1000 --read-only --cap-drop ALL --tmpfs /tmp:mode=1777,size=64m \
    -v "$ID-data:/data" -v "$TMP/server/clients:/clients:ro" -v "$ID-cache:/cache" \
    -e BACKUP_SERVER_DATA_DIR=/data/repos -e BACKUP_KEEP_HOURLY=1 -e BACKUP_KEEP_DAILY=0 -e BACKUP_KEEP_WEEKLY=0 -e BACKUP_KEEP_MONTHLY=0 \
    -e BACKUP_CHECK_SUBSET=100% --entrypoint backup-server-maintenance "$IMAGE" >"$TMP/upkeep.log" 2>&1 || { cat "$TMP/upkeep.log"; die "the server's upkeep failed"; }
tail -n 4 "$TMP/upkeep.log"
after="$(snapshots)"
echo "snapshots after the upkeep: $after"
[ "$after" -eq 3 ] || die "the upkeep should leave one snapshot per kind (3), found $after"
throwaway
EXTRA=("${CLIENT_ENV[@]}")
step "restore from the second machine"
drill
unset BACKUP_REPOSITORY
EXTRA=()

PASS=1
