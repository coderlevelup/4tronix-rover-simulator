# Infra: Mission Control on bt-impact-academy

Terraform for everything in Werner's deploy guide: Artifact Registry, Cloud
Run (staging + prod), deploy and runtime service accounts, Secret Manager,
and GitHub Workload Identity Federation. Firebase provisioning (Firestore
database, Auth, web app) happens alongside this, out of Terraform, see the
migration checklist below.

The project starts EMPTY. This is the from-zero order.

## Part A: Terraform bootstrap (one person, ~an hour)

```bash
gcloud auth login
gcloud config set project bt-impact-academy

# 1. Enable the API that lets Terraform enable the other APIs
gcloud services enable serviceusage.googleapis.com cloudresourcemanager.googleapis.com

# 2. The one hand-made resource: the state bucket (state cannot store itself)
gcloud storage buckets create gs://bt-impact-academy-tfstate \
  --location=africa-south1 --uniform-bucket-level-access

# 3. Plan and apply
cd infra
terraform init
terraform plan    # review: ~25 resources, nothing destructive, project is empty
terraform apply

# 4. Copy outputs into GitHub repo variables
terraform output
# Settings -> Secrets and variables -> Actions -> Variables:
#   GCP_WIF_PROVIDER, GCP_DEPLOY_SA, GCP_PROJECT_ID, GCP_REGION,
#   GCP_AR_REPO, STAGING_SERVICE, PROD_SERVICE
# plus the NEXT_PUBLIC_FIREBASE_* values from the NEW Firebase web app
# (Part B below).

# 5. Set the REAL secret values out-of-band (never in Terraform or git).
#    Terraform seeded each secret with a CHANGE_ME version so the first
#    apply can start the placeholder services; these commands add the real
#    values as the new "latest":
echo -n 'firebase-adminsdk-...@bt-impact-academy.iam.gserviceaccount.com' | \
  gcloud secrets versions add firebase-client-email --data-file=-
# private key: paste the PEM (real newlines) into a temp file, then:
gcloud secrets versions add firebase-private-key --data-file=key.pem && rm key.pem
```

After that, a push to main auto-deploys staging via
`.github/workflows/deploy-staging.yml`; prod is a manual, approval-gated
promotion via `deploy-prod.yml`.

GitHub settings to flip once (repo Settings):
- Branches -> main -> required status checks: both CI jobs
- Environments -> `production` -> required reviewers: Werner / Gavin

## Part B: Firebase migration (old project -> bt-impact-academy)

The app moves to Impact's Firebase world. In the Firebase console
(https://console.firebase.google.com), "Add project" -> select the EXISTING
`bt-impact-academy` GCP project, then:

1. **Firestore**: create the database (production mode). Location matters and
   is permanent: `africa-south1` if offered, else the nearest europe region.
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

- Region default is `africa-south1` (Johannesburg). Change `var.region`
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
