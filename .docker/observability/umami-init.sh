#!/bin/sh
# One-shot init for Umami: stamp the admin username/password from .env onto the
# default admin account that Umami seeds on first boot.
#
# Why this exists: Umami has no env var for admin credentials — it always seeds a
# fixed admin account (well-known user_id, username "admin", password "umami").
# This script waits for that row to exist, then overwrites it with the values from
# the environment so the stack comes up ready to log in with no manual step.
#
# First-run only: it stamps the credentials ONLY while the account still has Umami's
# factory default password ("umami"). Once the password has been changed — by this
# script or later by you in the Umami UI — subsequent `up`s leave it untouched, so a
# `down`/`up` with the Postgres volume intact never resets your real credentials.
# Trade-off: changing UMAMI_ADMIN_PASSWORD in .env later will NOT re-apply; change it
# in the Umami UI instead (or reset the umami_db_volume to start fresh).
set -e

# The fixed UUID Umami uses for its seeded admin account (stable across v2 releases).
ADMIN_ID='41e2b680-648e-4b09-bcd7-3e2b10c06264'

echo "[umami-init] waiting for Umami to seed its default admin account..."
until psql "$DATABASE_URL" -tAc "SELECT 1 FROM \"user\" WHERE user_id = '$ADMIN_ID'" 2>/dev/null | grep -q 1; do
    sleep 2
done

echo "[umami-init] applying admin credentials + default website from environment..."
# pgcrypto's crypt(..., gen_salt('bf')) produces a $2a$ bcrypt hash that Umami's
# bcryptjs verifies. Values are passed as psql variables so they are quoted safely.
# - The credential UPDATE is first-run only: the WHERE guard
#   `password = crypt('umami', password)` is true only while the account still holds
#   the factory default password, so it never overwrites a changed one.
# - The website INSERT uses a fixed id (UMAMI_WEBSITE_ID) so the frontend's
#   data-website-id is known up front. ON CONFLICT DO NOTHING makes it idempotent and
#   preserves any edits made later in the UI.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -v uname="$UMAMI_ADMIN_USER" \
    -v pw="$UMAMI_ADMIN_PASSWORD" \
    -v wid="$UMAMI_WEBSITE_ID" \
    -v wname="$UMAMI_WEBSITE_NAME" \
    -v wdomain="$UMAMI_WEBSITE_DOMAIN" <<SQL
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE "user"
   SET username = :'uname',
       password = crypt(:'pw', gen_salt('bf', 10))
 WHERE user_id = '$ADMIN_ID'
   AND password = crypt('umami', password);

INSERT INTO "website" (website_id, name, domain, user_id, created_by, created_at)
VALUES (:'wid', :'wname', :'wdomain', '$ADMIN_ID', '$ADMIN_ID', now())
ON CONFLICT (website_id) DO NOTHING;
SQL

echo "[umami-init] done — login as: $UMAMI_ADMIN_USER, website id: $UMAMI_WEBSITE_ID"
