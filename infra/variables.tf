variable "project_id" {
  description = "GCP project that hosts everything (Impact Academy)"
  type        = string
  default     = "bt-impact-academy"
}

variable "region" {
  description = "Region for Cloud Run + Artifact Registry. Co-located with Firestore, which is in europe-west1 because africa-south1 is not offered for Firestore."
  type        = string
  default     = "europe-west1"
}

variable "resend_from_email" {
  description = "From address for learner mission emails."
  type        = string
  default     = "onboarding@resend.dev"
}

variable "resend_sandbox_recipient" {
  description = "Redirects ALL mission email to one inbox while no sending domain is verified. Empty means normal delivery. Set via TF_VAR_resend_sandbox_recipient, never committed."
  type        = string
  default     = ""
}

variable "github_repository" {
  description = "GitHub repo allowed to deploy via Workload Identity Federation (owner/name)"
  type        = string
  default     = "HlalanathiMashimbye/4tronix-rover-simulator"
}

variable "environments" {
  description = "Cloud Run environments. min_instances = 1 during event days kills cold starts."
  type = map(object({
    min_instances = number
    max_instances = number
  }))
  default = {
    staging = { min_instances = 0, max_instances = 2 }
    prod    = { min_instances = 0, max_instances = 10 }
  }
}
