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
