#!/usr/bin/env bash
# One-time (idempotent) provisioning of the paper2notes hosting in Google Cloud.
#
# Run by a human with Owner on the project and permission on the billing
# account; every step is skipped when the resource already exists, so it is
# safe to re-run after a partial failure or to pick up changes to
# vm-startup.sh (metadata is refreshed each run).
#
#   BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX deploy/gcp/provision.sh
#
# What it creates, and why:
#   project        paper2notes-site            dedicated project, own billing line
#   network        paper2notes-net             custom VPC: no default allow-ssh rule
#   firewall       80/443 from anywhere; 22 only from the IAP tunnel range
#   VM             e2-micro, 10 GB pd-standard, Debian 12, us-west1-b, no VM
#                  service account (the VM never calls Google APIs), OS Login on
#   static IP      paper2notes-web-ip          stable URL across restarts
#   deployer SA    paper2notes-deployer        OS Login (no sudo) + IAP tunnel +
#                                              compute viewer, nothing else
#   WIF pool       github / paper2notes        GitHub Actions gets short-lived
#                                              tokens for the deployer SA; only
#                                              the yeungsinchun/paper2notes repo
#                                              may impersonate it, so no
#                                              long-lived key exists anywhere
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-paper2notes-site}"
PROJECT_NAME="paper2notes"
REGION="${GCP_REGION:-us-west1}"
ZONE="${GCP_ZONE:-us-west1-b}"
NETWORK=paper2notes-net
SUBNET=paper2notes-subnet
SUBNET_RANGE=10.10.0.0/24
INSTANCE="${GCP_INSTANCE:-paper2notes-web}"
TAG=paper2notes-web
ADDRESS=paper2notes-web-ip
MACHINE_TYPE="${GCP_MACHINE_TYPE:-e2-micro}"
DEPLOYER=paper2notes-deployer
GITHUB_REPO="${GITHUB_REPO:-yeungsinchun/paper2notes}"
WIF_POOL=github
WIF_PROVIDER=paper2notes
IAP_RANGE=35.235.240.0/20

here="$(cd "$(dirname "$0")" && pwd)"

log() { printf '\n== %s\n' "$*"; }

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
  compute.googleapis.com iap.googleapis.com oslogin.googleapis.com \
  iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com

log "network $NETWORK"
gcloud compute networks describe "$NETWORK" --project "$PROJECT_ID" >/dev/null 2>&1 ||
  gcloud compute networks create "$NETWORK" --project "$PROJECT_ID" --subnet-mode=custom
gcloud compute networks subnets describe "$SUBNET" --project "$PROJECT_ID" --region "$REGION" >/dev/null 2>&1 ||
  gcloud compute networks subnets create "$SUBNET" --project "$PROJECT_ID" \
    --network "$NETWORK" --region "$REGION" --range "$SUBNET_RANGE"

log "firewall"
gcloud compute firewall-rules describe "$NETWORK-allow-web" --project "$PROJECT_ID" >/dev/null 2>&1 ||
  gcloud compute firewall-rules create "$NETWORK-allow-web" --project "$PROJECT_ID" \
    --network "$NETWORK" --direction INGRESS --action ALLOW --rules tcp:80,tcp:443 \
    --source-ranges 0.0.0.0/0 --target-tags "$TAG"
gcloud compute firewall-rules describe "$NETWORK-allow-iap-ssh" --project "$PROJECT_ID" >/dev/null 2>&1 ||
  gcloud compute firewall-rules create "$NETWORK-allow-iap-ssh" --project "$PROJECT_ID" \
    --network "$NETWORK" --direction INGRESS --action ALLOW --rules tcp:22 \
    --source-ranges "$IAP_RANGE" --target-tags "$TAG"

log "deployer service account"
DEPLOYER_EMAIL="$DEPLOYER@$PROJECT_ID.iam.gserviceaccount.com"
gcloud iam service-accounts describe "$DEPLOYER_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$DEPLOYER" --project "$PROJECT_ID" \
    --display-name "paper2notes GitHub Actions deployer"
DEPLOYER_UID="$(gcloud iam service-accounts describe "$DEPLOYER_EMAIL" --project "$PROJECT_ID" --format='value(uniqueId)')"
DEPLOY_USER="sa_$DEPLOYER_UID"
for role in roles/compute.osLogin roles/iap.tunnelResourceAccessor roles/compute.viewer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:$DEPLOYER_EMAIL" --role "$role" --condition=None --quiet >/dev/null
done

log "static address $ADDRESS"
gcloud compute addresses describe "$ADDRESS" --project "$PROJECT_ID" --region "$REGION" >/dev/null 2>&1 ||
  gcloud compute addresses create "$ADDRESS" --project "$PROJECT_ID" --region "$REGION"
IP="$(gcloud compute addresses describe "$ADDRESS" --project "$PROJECT_ID" --region "$REGION" --format='value(address)')"

log "instance $INSTANCE"
if ! gcloud compute instances describe "$INSTANCE" --project "$PROJECT_ID" --zone "$ZONE" >/dev/null 2>&1; then
  gcloud compute instances create "$INSTANCE" --project "$PROJECT_ID" --zone "$ZONE" \
    --machine-type "$MACHINE_TYPE" \
    --image-family debian-12 --image-project debian-cloud \
    --boot-disk-size 10GB --boot-disk-type pd-standard \
    --network "$NETWORK" --subnet "$SUBNET" --address "$IP" \
    --tags "$TAG" \
    --no-service-account --no-scopes \
    --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring \
    --metadata "enable-oslogin=TRUE,deploy-user=$DEPLOY_USER" \
    --metadata-from-file "startup-script=$here/vm-startup.sh"
else
  gcloud compute instances add-metadata "$INSTANCE" --project "$PROJECT_ID" --zone "$ZONE" \
    --metadata "enable-oslogin=TRUE,deploy-user=$DEPLOY_USER" \
    --metadata-from-file "startup-script=$here/vm-startup.sh"
fi

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
  instance          $INSTANCE  $ZONE  $MACHINE_TYPE
  site              http://$IP/
  deployer SA       $DEPLOYER_EMAIL  (OS Login user $DEPLOY_USER)

GitHub Actions secrets for $GITHUB_REPO (values are identifiers, not keys):
  printf '%s' '$WIF_PROVIDER_NAME' | gh-axi secret set GCP_WORKLOAD_IDENTITY_PROVIDER
  printf '%s' '$DEPLOYER_EMAIL' | gh-axi secret set GCP_DEPLOYER_SERVICE_ACCOUNT
EOF
