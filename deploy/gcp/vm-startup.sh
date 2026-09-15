#!/bin/bash
# Compute Engine startup script for the paper2notes web VM.
#
# Runs as root on every boot (idempotent). Installs nginx, points it at
# /srv/paper2notes/current, and hands the release directory to the deploy
# user named in the `deploy-user` instance metadata key so CI can publish
# without sudo.
set -euo pipefail

SITE_ROOT=/srv/paper2notes
METADATA=http://metadata.google.internal/computeMetadata/v1/instance/attributes
DEPLOY_USER="$(curl -sf -H 'Metadata-Flavor: Google' "$METADATA/deploy-user" || true)"

if ! command -v nginx >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  apt-get install -y -q nginx
fi

mkdir -p "$SITE_ROOT/releases"
if [ ! -e "$SITE_ROOT/current" ]; then
  mkdir -p "$SITE_ROOT/releases/placeholder"
  cat > "$SITE_ROOT/releases/placeholder/index.html" <<'HTML'
<!doctype html><meta charset="utf-8"><title>paper2notes</title>
<p>paper2notes: no release deployed yet.</p>
HTML
  ln -sfn "$SITE_ROOT/releases/placeholder" "$SITE_ROOT/current"
fi

if [ -n "$DEPLOY_USER" ]; then
  # The deploy user is an OS Login account (sa_<uniqueId>), resolved through
  # the OS Login NSS module against the metadata server, so no local useradd.
  # A freshly created profile can take a minute or two to become resolvable.
  for _ in $(seq 1 24); do
    if id "$DEPLOY_USER" >/dev/null 2>&1; then
      chown -R "$DEPLOY_USER" "$SITE_ROOT"
      break
    fi
    sleep 5
  done
fi
chmod -R a+rX "$SITE_ROOT"

cat > /etc/nginx/sites-available/paper2notes <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /srv/paper2notes/current;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # notes/ has no top-level index; Book 5 is the only book so far.
    location = / {
        return 302 /book5/;
    }

    # Vendored libraries never change in place.
    location ~ ^/book5/(vendor|.*/js/lib)/ {
        expires 30d;
        add_header Cache-Control "public";
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
NGINX

ln -sfn /etc/nginx/sites-available/paper2notes /etc/nginx/sites-enabled/paper2notes
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl reload nginx || systemctl restart nginx
