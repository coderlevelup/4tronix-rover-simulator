# Mission Control hosting: Artifact Registry, Secret Manager, per-environment
# runtime service accounts and Cloud Run services, and least-privilege IAM.
#
# Terraform owns the SHAPE of the services; the deploy workflow owns WHICH
# image digest is serving (lifecycle.ignore_changes on the image), so a
# terraform apply never fights CD.

# --- Image registry -------------------------------------------------------

resource "google_artifact_registry_repository" "mission_control" {
  repository_id = "mission-control"
  format        = "DOCKER"
  location      = var.region
  description   = "Mission Control images, one tag per git SHA"
}

# --- Server secrets (values set out-of-band, never in Terraform) ----------

resource "google_secret_manager_secret" "firebase_client_email" {
  secret_id = "firebase-client-email"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "firebase_private_key" {
  secret_id = "firebase-private-key"
  replication {
    auto {}
  }
}

# Resend sends the learner mission-status emails. Without this the app throws
# on every status change (visible as `[mission-email] FAILED` in the logs).
resource "google_secret_manager_secret" "resend_api_key" {
  secret_id = "resend-api-key"
  replication {
    auto {}
  }
}

# Bootstrap seed: Cloud Run mounts these at version "latest", and a secret
# with zero versions makes the very first revision fail to start. The seed
# lets the initial apply succeed; the REAL values are added out-of-band
# afterwards (README step 5) and become the new "latest". The placeholder
# hello image never reads them.
resource "google_secret_manager_secret_version" "seed" {
  for_each = {
    client_email   = google_secret_manager_secret.firebase_client_email.id
    private_key    = google_secret_manager_secret.firebase_private_key.id
    resend_api_key = google_secret_manager_secret.resend_api_key.id
  }
  secret      = each.value
  secret_data = "CHANGE_ME-set-real-value-via-gcloud-secrets-versions-add"
}

locals {
  secrets = {
    FIREBASE_CLIENT_EMAIL = google_secret_manager_secret.firebase_client_email
    FIREBASE_PRIVATE_KEY  = google_secret_manager_secret.firebase_private_key
    RESEND_API_KEY        = google_secret_manager_secret.resend_api_key
  }

  # Non-secret runtime config. RESEND_SANDBOX_RECIPIENT is only emitted when
  # set: while it has a value, every mission email is redirected to that one
  # inbox and no learner receives mail, so it must stay unset in prod once a
  # sending domain is verified.
  plain_env = merge(
    {
      FIREBASE_PROJECT_ID = var.project_id
      RESEND_FROM_EMAIL   = var.resend_from_email
    },
    var.resend_sandbox_recipient == "" ? {} : {
      RESEND_SANDBOX_RECIPIENT = var.resend_sandbox_recipient
    },
  )
}

# --- Per-environment runtime identity + service ---------------------------

resource "google_service_account" "runtime" {
  for_each     = var.environments
  account_id   = "mission-control-${each.key}"
  display_name = "Mission Control runtime (${each.key}): Firestore + secrets only"
}

resource "google_project_iam_member" "runtime_firestore" {
  for_each = var.environments
  project  = var.project_id
  role     = "roles/datastore.user"
  member   = "serviceAccount:${google_service_account.runtime[each.key].email}"
}

resource "google_secret_manager_secret_iam_member" "runtime_secret_access" {
  for_each = {
    for pair in setproduct(keys(var.environments), keys(local.secrets)) :
    "${pair[0]}-${pair[1]}" => { env = pair[0], secret = pair[1] }
  }
  secret_id = local.secrets[each.value.secret].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime[each.value.env].email}"
}

resource "google_cloud_run_v2_service" "mission_control" {
  for_each = var.environments

  name     = "mission-control-${each.key}"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.runtime[each.key].email

    scaling {
      min_instance_count = each.value.min_instances
      max_instance_count = each.value.max_instances
    }

    containers {
      # Placeholder until the first CD deploy; ignore_changes below hands
      # image ownership to the deploy workflow after that.
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      dynamic "env" {
        for_each = local.plain_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  # Prod cannot be deleted by a stray destroy; staging can be torn down.
  deletion_protection = each.key == "prod"

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
    ]
  }

  depends_on = [
    google_secret_manager_secret_iam_member.runtime_secret_access,
    google_secret_manager_secret_version.seed,
  ]
}

# Learner-facing site is public by design (no auth surface exists in the app).
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  for_each = var.environments
  name     = google_cloud_run_v2_service.mission_control[each.key].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# --- Deploy service account powers (push image, roll services) ------------
# Scoped to exactly our registry repo and our two services, nothing wider
# (Werner's principle 5: least privilege).

resource "google_artifact_registry_repository_iam_member" "deploy_ar_writer" {
  repository = google_artifact_registry_repository.mission_control.name
  location   = var.region
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${var.deploy_service_account_email}"
}

resource "google_cloud_run_v2_service_iam_member" "deploy_run_developer" {
  for_each = var.environments
  name     = google_cloud_run_v2_service.mission_control[each.key].name
  location = var.region
  role     = "roles/run.developer"
  member   = "serviceAccount:${var.deploy_service_account_email}"
}

# Deploying a revision requires acting as the service's runtime identity.
resource "google_service_account_iam_member" "deploy_acts_as_runtime" {
  for_each           = var.environments
  service_account_id = google_service_account.runtime[each.key].name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${var.deploy_service_account_email}"
}
