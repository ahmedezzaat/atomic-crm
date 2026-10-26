#!/usr/bin/env bash
# One-command deploy to the Contabo server.
#   ./scripts/deploy.sh              database changes + build + upload the site
#   ./scripts/deploy.sh --functions  the same, and redeploy the server functions
set -euo pipefail
cd "$(dirname "$0")/.."

SERVER="root@13.140.152.7"
SITE_DIR="/var/www/kords-crm"

echo "1/4  Database changes (type y if it asks)"
npx supabase db push --linked

if [[ "${1:-}" == "--functions" ]]; then
  echo "     Server functions"
  npx supabase functions deploy
fi

echo "2/4  Building the website"
npm run build

echo "3/4  Packing it"
tar czf /tmp/kords-crm-site.tgz -C dist .

echo "4/4  Uploading (enter the server password once)"
ssh "$SERVER" "tar xzf - -C $SITE_DIR" < /tmp/kords-crm-site.tgz

echo "Done. Refresh https://crm.sirmatechnology.com with Cmd+Shift+R"
