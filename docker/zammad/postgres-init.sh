#!/bin/bash
# Creates the role Zammad connects as, and the database that role owns. The postgres image runs this
# once, while it initialises an EMPTY data directory, and never again.
#
# Why two roles: the image's bootstrap role is always a superuser. Zammad needs no superuser
# capability (it owns its database and uses the built-in plpgsql), so it gets a plain login role.
#
# Reads: ZAMMAD_DB, ZAMMAD_DB_USER, ZAMMAD_DB_PASS_FILE (a secret file, never the value in the environment).
# Mounted by `zammad-postgres` in compose.production.yaml. Docs: docs/operate/zammad.md
set -o errexit
set -o pipefail

# initdb has already run, so a rejected value cannot be fixed by correcting it and starting again:
# say so instead of leaving a role or database that is merely reported missing later.
abort() {
    echo "$1" >&2
    echo "Correct this, then remove the zammad-postgres-data volume and start again." >&2
    exit 1
}

[ -r "${ZAMMAD_DB_PASS_FILE:-}" ] || abort "ZAMMAD_DB_PASS_FILE does not name a readable file."
[ "${ZAMMAD_DB_USER}" != "${POSTGRES_USER}" ] || abort "ZAMMAD_DB_USER must differ from the superuser."
case "${ZAMMAD_DB}" in
    postgres | template0 | template1) abort "ZAMMAD_DB must not be one of PostgreSQL's system databases." ;;
esac

echo "Creating the '${ZAMMAD_DB_USER}' role and the '${ZAMMAD_DB}' database"

# The identifiers and the password go in as psql variables, so psql quotes them and no shell quoting
# reaches the statements. The password is read from the file here, one trailing newline dropped.
# https://www.postgresql.org/docs/17/app-psql.html#APP-PSQL-VARIABLES
psql --variable ON_ERROR_STOP=1 \
    --username "${POSTGRES_USER}" \
    --dbname "${POSTGRES_DB:-${POSTGRES_USER}}" \
    --variable role="${ZAMMAD_DB_USER}" \
    --variable pass="$(tr -d '\r\n' <"${ZAMMAD_DB_PASS_FILE}")" \
    --variable db="${ZAMMAD_DB}" <<'EOSQL'
CREATE ROLE :"role" LOGIN PASSWORD :'pass';
CREATE DATABASE :"db" OWNER :"role";
EOSQL
