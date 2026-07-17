# Remote state in GCS. The bucket is the ONE resource created by hand
# (chicken-and-egg: state cannot store itself). See README.md, step 2.
#
# Never commit .tfstate.
terraform {
  backend "gcs" {
    bucket = "bt-impact-academy-tfstate"
    prefix = "mission-control"
  }
}
