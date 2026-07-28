# Infra: Mission Control on bt-impact-academy

Terraform for everything in Werner's deploy guide: Artifact Registry, Cloud
Run (staging + prod), deploy and runtime service accounts, Secret Manager,
and GitHub Workload Identity Federation. Firebase provisioning (Firestore
database, Auth, web app) happens alongside this, out of Terraform, see the
migration checklist below.

**This is NOT a from-zero apply.** A partial apply ran on 2026-07-17 and
stopped part way. Part A below resumes it. State verified against the live
project on 2026-07-27.

## Part A: finish the Terraform bootstrap (one person, ~20 min)

### Already done, do not redo

- State bucket `gs://bt-impact-academy-tfstate` exists (in `africa-south1`;
  deliberate, state access has nothing to do with request latency).
- All 7 required APIs are enabled.
- 15 resources are already in state and healthy: the 7 APIs, the
  `mission-control-deploy` service account, the Artifact Registry repo, both
  Secret Manager secrets with their `CHANGE_ME` seed versions, and both
  runtime service accounts (staging + prod).

Skipping straight to `terraform apply` is correct. Running the old bucket
create or `gcloud services enable` will just error as already-existing.

### What is left

Not yet created: the Workload Identity pool, its provider and the
impersonation binding (the previous apply stopped right here), both Cloud Run
services, and every IAM binding.

```bash
gcloud auth login
gcloud config set project bt-impact-academy

cd infra
terraform init
terraform plan
terraform apply
```

**Expected plan: `19 to add, 0 to change, 1 to destroy`.**

The one destroy is the Artifact Registry repo. `location` is a force-new
attribute and the region moves `africa-south1 -> europe-west1` to co-locate
with Firestore, which Werner created in `europe-west1` (`africa-south1` is not
offered for Firestore). **This is safe right now because the repo is empty -
zero images have ever been pushed.** It stops being safe the moment the first
image lands, so this apply should happen before anyone builds and pushes.

There is no soft-deleted `github` Workload Identity pool, so the undelete +
import caveat in the Notes below does not apply.

### After the apply

```bash
# Copy outputs into GitHub repo variables
terraform output
# Settings -> Secrets and variables -> Actions -> Variables:
#   GCP_WIF_PROVIDER, GCP_DEPLOY_SA, GCP_PROJECT_ID, GCP_REGION,
#   GCP_AR_REPO, STAGING_SERVICE, PROD_SERVICE
# plus the NEXT_PUBLIC_FIREBASE_* values from the NEW Firebase web app
# (Part B). The deploy workflow reads all of these; it will fail without the
# NEXT_PUBLIC_FIREBASE_* set, so they gate the first deploy, not the apply.
```

### Not the apply operator's job: the real secret values

Both secrets still hold only the `CHANGE_ME` seed (version 1, 2026-07-17).
The real values come from the Firebase Admin SDK key generated in Part B
step 5, so whoever holds that key runs these, not whoever runs the apply:

```bash
echo -n 'firebase-adminsdk-...@bt-impact-academy.iam.gserviceaccount.com' | \
  gcloud secrets versions add firebase-client-email --data-file=-
# private key: paste the PEM (real newlines) into a temp file, then:
gcloud secrets versions add firebase-private-key --data-file=key.pem && rm key.pem
```

After that, a push to main auto-deploys staging via
`.github/workflows/deploy-staging.yml`; prod is a manual, approval-gated
promotion via `deploy-prod.yml`.

### Known gaps in what gets deployed (not blockers for the apply)

- **Resend is not provisioned at all**: no Secret Manager secret, no Cloud Run
  env var, nothing in the workflows. Mission status emails will throw on every
  status change in staging and prod (visible in logs as `[mission-email]
  FAILED`). Needs `RESEND_API_KEY` + `RESEND_FROM_EMAIL` adding before email
  works off a laptop.
- **`NEXT_PUBLIC_APP_URL` is not a build arg** in the Dockerfile or the deploy
  workflow, so email CTA links fall back to `http://localhost:3000`. It is
  inlined at `next build` time, so it has to be a GitHub *variable* available
  to the build, not a Cloud Run runtime env var.

GitHub settings to flip once (repo Settings):
- Branches -> main -> required status checks: both CI jobs
- Environments -> `production` -> required reviewers: Werner / Gavin

## Part B: Firebase migration (old project -> bt-impact-academy)

The app moves to Impact's Firebase world. In the Firebase console
(https://console.firebase.google.com), "Add project" -> select the EXISTING
`bt-impact-academy` GCP project, then:

1. **Firestore**: DONE - Werner created the database in `europe-west1`
   (`africa-south1` is not offered for Firestore). Location is permanent.
   Confirm it is the `(default)` database, not a named one: the app passes no
   database id anywhere, so a named database would need code changes.
2. **Authentication**: enable the Email/Password provider (operators only;
   learners never sign in).
3. **Web app**: add one, copy its config. These are the new
   `NEXT_PUBLIC_FIREBASE_*` values for GitHub variables and local `.env`.
4. **Security rules + indexes**: export from the OLD project
   (`firebase firestore:rules:get`, or console copy-paste) and deploy to the
   new one. Commit `firestore.rules` + `firestore.indexes.json` to the repo
   while at it, so rules stop being console-only state.
5. **Admin credentials**: Project settings -> Service accounts -> generate a
   key for the Admin SDK. Its client_email and private_key are what goes into
   Secret Manager (Part A step 5) and into the yard satellite's env.
6. **Operator accounts**: create the operator users in the new project's
   Auth, then grant roles with
   `python yard/satellite/set_operator_claims.py <email> operator`
   (run with the NEW project's env).
7. **Data**: decide migrate vs fresh start. To migrate the missions and
   learners collections: `gcloud firestore export` on the old project to a
   GCS bucket, grant the new project access, `gcloud firestore import`.
   A fresh start is also defensible; the old feed content is the only loss.
8. **Repoint everything**: mission-control `.env`, the yard satellite env,
   and GitHub variables all switch to the new project's values. Nothing else
   changes: the app never hardcodes project identity.

## Notes

- Region default is `europe-west1`, co-located with the Firestore database
  Werner created there. Johannesburg (`africa-south1`) would be closer to the
  yard, but Firestore is not offered in it, and splitting Cloud Run from
  Firestore puts a cross-continent hop on every read. Change `var.region`
  before the first apply if Impact prefers another; it is painful to move
  later (registry + services are regional).
- Terraform deliberately does NOT manage the serving image (lifecycle
  ignore_changes): CD owns which digest runs, Terraform owns everything else.
- Naming: current names are simple (`mission-control-staging` etc.). Werner
  confirmed conventions can be refactored later; `terraform state mv` +
  rename is the path when Impact's conventions arrive.
- Werner's guide item 5 (Terraform plan on PRs touching infra/) needs WIF to
  exist first; add that workflow after Part A proves out.
- GCS bucket names are globally unique: if `bt-impact-academy-tfstate` is
  taken, pick another and change it in both the create command and
  `backend.tf`.
- Deleted Workload Identity pools soft-delete for 30 days. If an apply says
  the pool id `github` already exists in a deleted state, restore it
  (`gcloud iam workload-identity-pools undelete github --location=global`)
  and `terraform import` it rather than renaming.
