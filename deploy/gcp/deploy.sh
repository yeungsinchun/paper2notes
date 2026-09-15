#!/usr/bin/env bash
# Publish notes/ to the paper2notes Compute Engine VM.
#
# Used by .github/workflows/deploy.yml and runnable locally by anyone whose
# gcloud identity has OS Login + IAP tunnel access to the instance:
#
#   deploy/gcp/deploy.sh
#
# Steps: tar notes/ (minus intake and local-only material), copy it over an
# IAP-tunnelled SSH session, unpack into a timestamped release directory on
# the VM, atomically repoint /srv/paper2notes/current, prune old releases.
# Nothing here needs sudo on the VM; nginx serves whatever `current` points at.
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-paper2notes-site}"
ZONE="${GCP_ZONE:-us-west1-b}"
INSTANCE="${GCP_INSTANCE:-paper2notes-web}"
SITE_ROOT=/srv/paper2notes
KEEP_RELEASES=3

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
notes_dir="$repo_root/notes"
[ -d "$notes_dir/book5" ] || { echo "deploy: $notes_dir/book5 missing" >&2; exit 1; }

release="$(date -u +%Y%m%dT%H%M%SZ)-$(git -C "$repo_root" rev-parse --short HEAD 2>/dev/null || echo local)"
tarball="$(mktemp -t paper2notes-XXXXXX).tgz"
trap 'rm -f "$tarball"' EXIT

# _source/ is intake/OCR provenance and _local/ is gitignored exam material;
# neither belongs on the student-facing site.
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$tarball" -C "$notes_dir" \
  --exclude='./_source' --exclude='_local' --exclude='*.test.mjs' .
echo "deploy: release $release ($(du -h "$tarball" | cut -f1)) -> $INSTANCE ($ZONE, $PROJECT_ID)"

ssh_flags=(--project "$PROJECT_ID" --zone "$ZONE" --tunnel-through-iap --quiet
  --ssh-key-expire-after=1h --strict-host-key-checking=no)

# IAP tunnels occasionally drop mid-transfer; the upload is small, so retry.
uploaded=0
for attempt in 1 2 3; do
  if gcloud compute scp "${ssh_flags[@]}" "$tarball" "$INSTANCE:/tmp/paper2notes-$release.tgz"; then
    uploaded=1
    break
  fi
  echo "deploy: upload attempt $attempt failed, retrying" >&2
  sleep 5
done
[ "$uploaded" = 1 ] || { echo "deploy: upload failed" >&2; exit 1; }

gcloud compute ssh "$INSTANCE" "${ssh_flags[@]}" --command "set -euo pipefail
rel='$SITE_ROOT/releases/$release'
mkdir -p \"\$rel\"
tar -xzf '/tmp/paper2notes-$release.tgz' -C \"\$rel\"
rm -f '/tmp/paper2notes-$release.tgz'
chmod -R a+rX \"\$rel\"
ln -sfn \"\$rel\" '$SITE_ROOT/current.new'
mv -T '$SITE_ROOT/current.new' '$SITE_ROOT/current'
ls -1dt '$SITE_ROOT'/releases/*/ | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf
echo \"deploy: live release \$(readlink '$SITE_ROOT/current')\"
"

ip="$(gcloud compute instances describe "$INSTANCE" --project "$PROJECT_ID" --zone "$ZONE" \
  --format='value(networkInterfaces[0].accessConfigs[0].natIP)')"
echo "deploy: verifying http://$ip/book5/"
for _ in 1 2 3 4 5; do
  if curl -fsS -o /dev/null "http://$ip/book5/"; then
    echo "deploy: ok http://$ip/book5/"
    exit 0
  fi
  sleep 3
done
echo "deploy: site did not answer at http://$ip/book5/" >&2
exit 1
