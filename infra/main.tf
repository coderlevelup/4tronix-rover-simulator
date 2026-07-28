# Everything Werner's deploy guide puts in Terraform scope: APIs, Artifact
# Registry, Cloud Run (staging + prod), deploy + runtime service accounts,
# Secret Manager, and the GitHub -> GCP Workload Identity Federation.
#
# Firebase itself (Firestore database, Auth, the web app) is provisioned by
# the Firebase migration workstream (console / firebase CLI), not here.

locals {
  required_apis = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "cloudresourcemanager.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each           = toset(local.required_apis)
  service            = each.value
  disable_on_destroy = false
}

module "github_wif" {
  source            = "./modules/github-wif"
  project_id        = var.project_id
  github_repository = var.github_repository

  depends_on = [google_project_service.apis]
}

module "mission_control" {
  source       = "./modules/mission-control"
  project_id   = var.project_id
  region       = var.region
  environments = var.environments

  resend_from_email        = var.resend_from_email
  resend_sandbox_recipient = var.resend_sandbox_recipient

  deploy_service_account_email = module.github_wif.deploy_service_account_email

  depends_on = [google_project_service.apis]
}
