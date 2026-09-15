# Hosting on Google Cloud

The notes are served as static files by nginx on one Compute Engine VM.

| Item | Value |
|------|-------|
| GCP project | `paper2notes-site` |
| Instance | `paper2notes-web`, `us-west1-b`, `e2-micro`, 10 GB `pd-standard`, Debian 12 |
| Site | `http://<static IP>/` (redirects to `/book5/`) - the IP is `paper2notes-web-ip` in `us-west1` |
| Web root | `/srv/paper2notes/current` -> `/srv/paper2notes/releases/<timestamp>-<sha>` |
| Deployer | `paper2notes-deployer@paper2notes-site.iam.gserviceaccount.com` |

Files:

- `provision.sh` - idempotent, creates everything above (run once by a human with billing access; re-run to push a changed `vm-startup.sh`).
- `vm-startup.sh` - VM startup script: installs nginx, writes the site config, hands `/srv/paper2notes` to the deployer's OS Login user.
- `deploy.sh` - what CI runs: tars `notes/` (without `_source/`, `_local/`, tests), copies it over an IAP-tunnelled SSH session, unpacks into a new release directory, swaps the `current` symlink, keeps the last 3 releases, and checks `http://<ip>/book5/` answers.

`.github/workflows/deploy.yml` runs `deploy.sh` on every push to `main` that touches `notes/` or `deploy/gcp/` (or manually via *Run workflow*). It authenticates with Workload Identity Federation, so no cloud key is stored anywhere; the two GitHub secrets `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOYER_SERVICE_ACCOUNT` are resource names printed by `provision.sh`.

Access model:

- Port 22 is reachable only from Google's IAP range (`35.235.240.0/20`); 80/443 are open. The VM runs with no service account of its own.
- The deployer service account has `roles/compute.osLogin` (no sudo), `roles/iap.tunnelResourceAccessor`, and `roles/compute.viewer`. Only workflows from `yeungsinchun/paper2notes` can impersonate it.
- To deploy from a laptop, any project Owner can run `deploy/gcp/deploy.sh` directly. To exercise exactly the CI identity, prefix it with `CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT=paper2notes-deployer@paper2notes-site.iam.gserviceaccount.com` (`provision.sh` grants the account that ran it `roles/iam.serviceAccountTokenCreator` on the deployer).
- The deployer's OS Login POSIX user is `sa_<uniqueId>`; `provision.sh` creates that profile before the VM boots because `vm-startup.sh` needs to `chown` the release directory to it.

Monthly cost (as of Sep 2026): the VM, disk, one attached IPv4 address, and the first 1 GB of egress are inside the Always Free tier for `e2-micro` in `us-west1`, so the expected bill is $0 while this is the only e2-micro on the billing account. Without the free tier it would be about $6.11 (e2-micro) + $0.40 (10 GB pd-standard) + $3.65 (IPv4) = ~$10/month plus egress at ~$0.12/GB.
