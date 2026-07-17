output "artifact_registry_repo" {
  value = google_artifact_registry_repository.mission_control.repository_id
}

output "service_names" {
  value = { for env, svc in google_cloud_run_v2_service.mission_control : env => svc.name }
}

output "service_urls" {
  value = { for env, svc in google_cloud_run_v2_service.mission_control : env => svc.uri }
}
