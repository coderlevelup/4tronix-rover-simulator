# These outputs are exactly the GitHub Actions *variables* the deploy
# workflows read (see .github/workflows/deploy-staging.yml header).
# After `terraform apply`, copy them into GitHub:
# Settings -> Secrets and variables -> Actions -> Variables.

output "GCP_WIF_PROVIDER" {
  value = module.github_wif.workload_identity_provider
}

output "GCP_DEPLOY_SA" {
  value = module.github_wif.deploy_service_account_email
}

output "GCP_PROJECT_ID" {
  value = var.project_id
}

output "GCP_REGION" {
  value = var.region
}

output "GCP_AR_REPO" {
  value = module.mission_control.artifact_registry_repo
}

output "STAGING_SERVICE" {
  value = module.mission_control.service_names["staging"]
}

output "PROD_SERVICE" {
  value = module.mission_control.service_names["prod"]
}

output "service_urls" {
  value = module.mission_control.service_urls
}
