#!/usr/bin/env bash
# One-time (idempotent) provisioning of paper2notes hosting on Cloud Run.
#
# Run by a human with Owner on the project and permission on the billing
# account; every step is skipped when the resource already exists, so it is
# safe to re-run after a partial failure.
#
#   BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX deploy/cloudrun/provision.sh
#
# What it creates, and why:
#   project        paper2notes-site          dedicated project, own billing line
#   registry       paper2notes (asia-east1)  Artifact Registry Docker repo; keeps
#                                            the 5 newest images, deletes the rest
#   runtime SA     paper2notes-runtime       identity the container runs as; has
#                                            no roles at all (nginx needs none)
#   Cloud Run      paper2notes (asia-east1)  public, scale-to-zero, max 2
#                                            instances, 128 MiB; created with a
#                                            placeholder image, CI rolls the real
#                                            one out on every push to main
#   deployer SA    paper2notes-deployer      run.developer on the project, writer
#                                            on the registry, actAs the runtime
#                                            SA, nothing else
#   WIF pool       github / paper2notes      GitHub Actions gets short-lived
#                                            tokens for the deployer SA; only the
#                                            yeungsinchun/paper2notes repo may
#                                            impersonate it, so no long-lived key
#                                            exists anywhere
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-paper2notes-site}"
PROJECT_NAME="paper2notes"
REGION="${GCP_REGION:-asia-east1}"
SERVICE="${GCP_RUN_SERVICE:-paper2notes}"
REPOSITORY="${GCP_AR_REPOSITORY:-paper2notes}"
RUNTIME_SA=paper2notes-runtime
DEPLOYER=paper2notes-deployer
GITHUB_REPO="${GITHUB_REPO:-yeungsinchun/paper2notes}"
WIF_POOL=github
WIF_PROVIDER=paper2notes
PLACEHOLDER_IMAGE=us-docker.pkg.dev/cloudrun/container/hello

log() { printf '\n== %s\n' "$*"; }

# IAM and service accounts are eventually consistent; poll instead of failing.
wait_for() { # wait_for <description> <command...>
  local what="$1"; shift
  for _ in $(seq 1 12); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 5
  done
  echo "timed out waiting for $what" >&2
  return 1
}

log "project $PROJECT_ID"
if ! gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud projects create "$PROJECT_ID" --name="$PROJECT_NAME"
fi
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

log "billing"
if [ "$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)')" != "True" ]; then
  : "${BILLING_ACCOUNT:?set BILLING_ACCOUNT to link billing (gcloud billing accounts list)}"
  gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
fi

log "APIs"
gcloud services enable --project "$PROJECT_ID" \
  run.googleapis.com artifactregistry.googleapis.com \
  iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com

log "Artifact Registry repository $REPOSITORY"
gcloud artifacts repositories describe "$REPOSITORY" --project "$PROJECT_ID" --location "$REGION" >/dev/null 2>&1 ||
  gcloud artifacts repositories create "$REPOSITORY" --project "$PROJECT_ID" --location "$REGION" \
    --repository-format docker --description "paper2notes site images"
policy="$(mktemp)"
cat > "$policy" <<'JSON'
[
  {"name": "keep-newest", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 5}},
  {"name": "delete-old", "action": {"type": "Delete"}, "condition": {"olderThan": "86400s"}}
]
JSON
gcloud artifacts repositories set-cleanup-policies "$REPOSITORY" --project "$PROJECT_ID" --location "$REGION" \
  --policy "$policy" --no-dry-run --quiet >/dev/null
rm -f "$policy"

log "runtime service account $RUNTIME_SA"
RUNTIME_EMAIL="$RUNTIME_SA@$PROJECT_ID.iam.gserviceaccount.com"
gcloud iam service-accounts describe "$RUNTIME_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$RUNTIME_SA" --project "$PROJECT_ID" \
    --display-name "paper2notes Cloud Run runtime (no permissions)"
wait_for "$RUNTIME_EMAIL" gcloud iam service-accounts describe "$RUNTIME_EMAIL" --project "$PROJECT_ID"

log "deployer service account $DEPLOYER"
DEPLOYER_EMAIL="$DEPLOYER@$PROJECT_ID.iam.gserviceaccount.com"
gcloud iam service-accounts describe "$DEPLOYER_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$DEPLOYER" --project "$PROJECT_ID" \
    --display-name "paper2notes GitHub Actions deployer"
wait_for "$DEPLOYER_EMAIL" gcloud iam service-accounts describe "$DEPLOYER_EMAIL" --project "$PROJECT_ID"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:$DEPLOYER_EMAIL" --role roles/run.developer --condition=None --quiet >/dev/null
gcloud artifacts repositories add-iam-policy-binding "$REPOSITORY" --project "$PROJECT_ID" --location "$REGION" \
  --member "serviceAccount:$DEPLOYER_EMAIL" --role roles/artifactregistry.writer --quiet >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_EMAIL" --project "$PROJECT_ID" \
  --member "serviceAccount:$DEPLOYER_EMAIL" --role roles/iam.serviceAccountUser --quiet >/dev/null
# Let the human running this script test deploys as the CI identity.
ME="$(gcloud config get-value account 2>/dev/null)"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_EMAIL" --project "$PROJECT_ID" \
  --member "user:$ME" --role roles/iam.serviceAccountTokenCreator --quiet >/dev/null

log "Cloud Run service $SERVICE"
if ! gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" >/dev/null 2>&1; then
  # Public access (allUsers invoker) is set here, once, by an Owner; the
  # deployer only has run.developer and cannot change IAM later.
  gcloud run deploy "$SERVICE" --project "$PROJECT_ID" --region "$REGION" \
    --image "$PLACEHOLDER_IMAGE" \
    --service-account "$RUNTIME_EMAIL" \
    --allow-unauthenticated --ingress all \
    --port 8080 --cpu 1 --memory 128Mi --min-instances 0 --max-instances 2 \
    --concurrency 80 --timeout 30 --quiet
fi
URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"

log "workload identity federation for GitHub Actions"
gcloud iam workload-identity-pools describe "$WIF_POOL" --project "$PROJECT_ID" --location global >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$WIF_POOL" --project "$PROJECT_ID" --location global \
    --display-name "GitHub Actions"
gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER" --project "$PROJECT_ID" \
  --location global --workload-identity-pool "$WIF_POOL" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" --project "$PROJECT_ID" \
    --location global --workload-identity-pool "$WIF_POOL" \
    --display-name "$GITHUB_REPO" \
    --issuer-uri https://token.actions.githubusercontent.com \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition "assertion.repository == '$GITHUB_REPO'"
PRINCIPAL="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$WIF_POOL/attribute.repository/$GITHUB_REPO"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_EMAIL" --project "$PROJECT_ID" \
  --member "$PRINCIPAL" --role roles/iam.workloadIdentityUser --quiet >/dev/null
WIF_PROVIDER_NAME="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$WIF_POOL/providers/$WIF_PROVIDER"

cat <<EOF

Provisioned.
  project           $PROJECT_ID ($PROJECT_NUMBER)
  service           $SERVICE  $REGION
  site              $URL/
  registry          $REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY
  deployer SA       $DEPLOYER_EMAIL

GitHub Actions secrets for $GITHUB_REPO (values are identifiers, not keys):
  printf '%s' '$WIF_PROVIDER_NAME' | gh-axi secret set GCP_WORKLOAD_IDENTITY_PROVIDER
  printf '%s' '$DEPLOYER_EMAIL' | gh-axi secret set GCP_DEPLOYER_SERVICE_ACCOUNT
EOF
