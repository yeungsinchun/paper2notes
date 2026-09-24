#!/usr/bin/env bash
# Build the paper2notes image, push it to Artifact Registry, roll it out to the
# Cloud Run service, and check the site answers.
#
# Used by .github/workflows/deploy.yml; runnable locally by anyone whose
# gcloud identity can push to the registry and deploy the service (or, to
# exercise the CI identity exactly, with
# CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT=<deployer email>):
#
#   deploy/cloudrun/deploy.sh
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-paper2notes-site}"
REGION="${GCP_REGION:-asia-east2}"
SERVICE="${GCP_RUN_SERVICE:-paper2notes}"
REPOSITORY="${GCP_AR_REPOSITORY:-paper2notes}"

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
[ -d "$repo_root/notes/book5" ] || { echo "deploy: notes/book5 missing" >&2; exit 1; }

sha="$(git -C "$repo_root" rev-parse --short HEAD 2>/dev/null || echo local)"
registry="$REGION-docker.pkg.dev"
image="$registry/$PROJECT_ID/$REPOSITORY/site"
tag="$image:$(date -u +%Y%m%dT%H%M%SZ)-$sha"

echo "deploy: building $tag"
# Cloud Run runs amd64; build for it explicitly so laptops on arm64 work too.
docker build --platform linux/amd64 -f "$repo_root/deploy/cloudrun/Dockerfile" -t "$tag" "$repo_root"

gcloud auth configure-docker "$registry" --quiet
docker push "$tag"

echo "deploy: rolling out to Cloud Run service $SERVICE ($REGION, $PROJECT_ID)"
gcloud run deploy "$SERVICE" --project "$PROJECT_ID" --region "$REGION" \
  --image "$tag" --quiet

url="$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" \
  --format='value(status.url)')"
echo "deploy: verifying $url/book5/"
for _ in 1 2 3 4 5; do
  if curl -fsS -o /dev/null "$url/book5/"; then
    echo "deploy: ok $url/book5/"
    exit 0
  fi
  sleep 3
done
echo "deploy: site did not answer at $url/book5/" >&2
exit 1
