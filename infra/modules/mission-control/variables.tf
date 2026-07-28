variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "environments" {
  type = map(object({
    min_instances = number
    max_instances = number
  }))
}

variable "deploy_service_account_email" {
  description = "CI deploy SA (from the github-wif module)"
  type        = string
}

variable "resend_from_email" {
  description = "From address for learner mission emails. Stays onboarding@resend.dev (Resend's shared sandbox sender) until a domain is verified; while it is, Resend rejects every recipient except the account owner."
  type        = string
  default     = "onboarding@resend.dev"
}

variable "resend_sandbox_recipient" {
  description = "Redirects ALL mission email to this one inbox, for demoing while no domain is verified. Empty means normal delivery. Must be empty in prod once a domain is verified, or no learner ever receives mail. Set out-of-band, never committed (it is a personal address)."
  type        = string
  default     = ""
}
