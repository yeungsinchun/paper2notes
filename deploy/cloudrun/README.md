# Hosting on Cloud Run

The notes are served as static files by nginx in a container on Cloud Run.

| Item | Value |
|------|-------|
| GCP project | `paper2notes-site` (152505675251) |
| Service | `paper2notes`, region `asia-east2` (Hong Kong), public, scale-to-zero, max 2 instances, 1 vCPU / 128 MiB, runs as `paper2notes-runtime@paper2notes-site.iam.gserviceaccount.com` (no roles) |
| Site | https://paper2notes-152505675251.asia-east2.run.app/ (redirects to `/book5/`); HTTPS is provided by Cloud Run |
| Image | `asia-east2-docker.pkg.dev/paper2notes-site/paper2notes/site:<utc-timestamp>-<sha>`, `nginxinc/nginx-unprivileged:stable-alpine` + `notes/` (about 63 MB) |
| Deployer | `paper2notes-deployer@paper2notes-site.iam.gserviceaccount.com` |

Files:

- `Dockerfile` + `nginx.conf` - the image; the repo-root `.dockerignore` keeps everything except `notes/` (minus `_source/`, `_local/`, `*.test.mjs`) and the nginx config out of the build context.
- `provision.sh` - idempotent, creates everything above (run once by a human with billing access). It also creates the Cloud Run service with a placeholder image and sets the public-invoker binding, which the deployer is not allowed to do.
- `deploy.sh` - what CI runs: `docker build --platform linux/amd64`, push to Artifact Registry, `gcloud run deploy --image`, then check `<service url>/book5/` returns 200.

`.github/workflows/deploy.yml` runs `deploy.sh` on every push to `main` that touches `notes/`, `deploy/cloudrun/`, `.dockerignore`, or the workflow (or manually via *Run workflow*). It authenticates with Workload Identity Federation, so no cloud key is stored anywhere; the two GitHub secrets `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOYER_SERVICE_ACCOUNT` are resource names printed by `provision.sh`.

Access model:

- The deployer service account has `roles/run.developer` on the project, `roles/artifactregistry.writer` on the `paper2notes` repository, and `roles/iam.serviceAccountUser` on the runtime service account. It cannot change who may invoke the service. Only workflows from `yeungsinchun/paper2notes` can impersonate it.
- The container runs as a service account with no permissions and the image contains only nginx and the notes.
- To deploy from a laptop, any project Owner can run `deploy/cloudrun/deploy.sh` (needs Docker). To exercise exactly the CI identity, prefix it with `CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT=paper2notes-deployer@paper2notes-site.iam.gserviceaccount.com` (`provision.sh` grants the account that ran it `roles/iam.serviceAccountTokenCreator` on the deployer).
- Artifact Registry keeps the 5 newest images and deletes older ones after a day, so rollback to a recent image is `gcloud run deploy paper2notes --region asia-east2 --image <older tag>`.

Monthly cost (as of Sep 2026): Cloud Run's Always Free tier covers 2 million requests, 180,000 vCPU-seconds and 360,000 GiB-seconds per month, and the service scales to zero between visits, so compute is expected to be $0. Artifact Registry storage stays under its 0.5 GB free allowance. Outbound traffic from `asia-east2` is charged (~$0.12/GB); the whole site is about 1.3 MB compressed, so even a few hundred visits a month is cents.

## Prior asia-east1 deployment

The service previously ran in `asia-east1` (Taiwan); the captain asked to move it to `asia-east2` (Hong Kong) instead. That `asia-east1` service and its Artifact Registry repository are left running as-is at https://paper2notes-152505675251.asia-east1.run.app/ — still serving a stale manual snapshot from before this deploy setup was finished — pending a separate decision on whether to remove them.
