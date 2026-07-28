# Deploy workstreams: Kamo and Konke

Context: we are moving Mission Control off the original Firebase project onto
Impact's GCP project (`bt-impact-academy`, currently empty) and shipping it
through Terraform + GitHub Actions onto Cloud Run, per Werner's deploy guide.
Hlali runs the Terraform/pipeline lane. These are the other two lanes.

**Dependencies at a glance:** all three lanes can start today in parallel.
The merge points are near the end:

```
Kamo step 4 (web app config) ──────► Hlali (GitHub variables)
Kamo step 6 (admin key) ───────────► Hlali (Secret Manager values)
Kamo steps 1-7 complete ───────────► Konke steps 5-7 (E2E on the new project)
Hlali (infra + first deploy) ──────► Konke step 8 (staging smoke)
```

Konke steps 1-4 need nobody. Kamo needs nobody. Hlali blocks on Kamo only at
the very end. So nobody waits to start; coordinate at the arrows.

---

## Kamo: Firebase migration (old project -> bt-impact-academy)

You are recreating our Firebase world inside Impact's project. Console access
to `bt-impact-academy` is already granted; check you can open it at
https://console.cloud.google.com before starting.

### 1. Attach Firebase to the Impact project
- Go to https://console.firebase.google.com -> Add project.
- Do NOT create a new project: pick "Add Firebase to a Google Cloud project"
  and select `bt-impact-academy`.
- Decline Google Analytics unless David wants it.

### 2. Create the Firestore database - DONE
- Werner created it in `europe-west1` (`africa-south1` is not offered for
  Firestore). This choice is permanent.
- Still to confirm: that it is the **`(default)`** database and not a named
  one. Nothing in the app passes a database id - mission-control's client and
  admin SDKs and the yard satellite all resolve it from the project id alone -
  so a named database would need code changes in all three.
- `infra/variables.tf` now defaults `region` to `europe-west1` to match, so
  Cloud Run and Firestore stay co-located.

### 3. Enable operator sign-in
- Build -> Authentication -> Get started -> Sign-in method.
- Enable **Email/Password** only. Nothing else. Learners never sign in;
  this exists purely for the yard operator console.

### 4. Create the web app and capture its config
- Project settings (gear) -> Your apps -> Add app -> Web.
- Name it `mission-control`. No hosting.
- Copy the config block. Those values are the new
  `NEXT_PUBLIC_FIREBASE_API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`,
  `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID`, `MEASUREMENT_ID`.
- Deliver them to Hlali (they go into GitHub Actions variables) and update
  your own `mission-control/.env` with them for testing.

### 5. Move the security rules and indexes (the sneaky-hard step)
The old project's rules and composite indexes live only in its console right
now. They must come into the repo and then deploy to the new project.

- Old project console -> Firestore -> Rules -> copy the full rules text into
  a new file `firestore.rules` at the repo root.
- Install the CLI if needed (`npm i -g firebase-tools`, then
  `firebase login`).
- Export indexes from the old project:
  `firebase firestore:indexes --project <OLD_PROJECT_ID> > firestore.indexes.json`
- Create `firebase.json` at the repo root:
  ```json
  {
    "firestore": {
      "rules": "firestore.rules",
      "indexes": "firestore.indexes.json"
    }
  }
  ```
- Deploy to the new project:
  `firebase deploy --only firestore --project bt-impact-academy`
- Commit `firestore.rules`, `firestore.indexes.json`, and `firebase.json` on
  a branch and PR it. From now on rules are code, not console state.

### 6. Generate the Admin SDK credentials
- New project -> Project settings -> Service accounts -> Generate new
  private key. A JSON file downloads.
- Hlali needs `client_email` and `private_key` from it for Secret Manager,
  and the yard satellite needs the same values in its env.
- **Never** commit this file, never paste it in WhatsApp/Slack. Hand it over
  in person or via a password manager share, then delete your download.

### 7. Recreate the operator accounts
- Authentication -> Users -> Add user, for each operator (you, Hlali, Konke,
  whoever worked the yard on Saturday).
- Point your local env at the NEW project (step 4 values + step 6 values),
  then grant roles from the repo root:
  ```bash
  set -a && source mission-control/.env && set +a
  .venv/bin/python3 yard/satellite/set_operator_claims.py <email> operator
  ```
- Verify: sign in at the yard satellite `/operator/login` locally.

### 8. Data: migrate or fresh start (decision with David)
- Fresh start is fine if David agrees; the only loss is the existing feed
  content (the Mandela Day missions and videos).
- To migrate instead:
  ```bash
  gcloud config set project <OLD_PROJECT_ID>
  gcloud firestore export gs://<old-project-bucket>/migration
  gcloud config set project bt-impact-academy
  gcloud firestore import gs://<old-project-bucket>/migration
  ```
  (the new project's service account needs read access on that bucket;
  Hlali can grant it.)

### 9. Done when
- The app runs locally against the new project: feed loads, a mission
  submits, it appears in the yard operator console, operator login works.
- Rules/indexes are merged in the repo.
- Hlali has the web config and the admin credentials.

---

## Konke: container proof + end-to-end validation

You own proving the thing we ship actually runs, first the container
locally, then the full loop against Impact's project, then the first staging
deploy. Steps 1 to 4 need nothing from anyone; start today.

### 1. Install Docker Desktop
- https://docs.docker.com/desktop/ (Mac or Windows). Start it, check
  `docker --version` works in a terminal.

### 2. Build the image
Nobody has built this Dockerfile yet (no Docker on Hlali's machine), so you
are the first real test of it. From the repo root, with values taken from
`mission-control/.env`:
```bash
cd mission-control
docker build \
  --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=... \
  --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=... \
  --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=... \
  --build-arg NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=... \
  --build-arg NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=... \
  --build-arg NEXT_PUBLIC_FIREBASE_APP_ID=... \
  --build-arg NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=... \
  -t mission-control:local .
```
If the build fails, that is a real finding: capture the error and send it to
Hlali, do not work around it silently.

### 3. Run and probe the container
```bash
docker run --rm -p 8080:8080 \
  -e FIREBASE_PROJECT_ID=... \
  -e FIREBASE_CLIENT_EMAIL=... \
  -e FIREBASE_PRIVATE_KEY="..." \
  mission-control:local
```
(the three `-e` values from `mission-control/.env`; quotes matter on the key)

Checklist:
- `http://localhost:8080/` loads the feed (Firestore reads work)
- `http://localhost:8080/operator` is a **404** (must stay dead in prod)
- `/mission` loads, the simulator runs a Blocks program
- Submit a test mission; it appears in Firestore
- `docker image ls mission-control:local`: note the size (should be a few
  hundred MB, not gigabytes)

### 4. Try the PORT contract
Cloud Run injects a port. Prove the container honors it:
```bash
docker run --rm -p 9999:9999 -e PORT=9999 mission-control:local
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9999/   # expect 200
```

### 5. WAIT POINT: needs Kamo finished
Rebuild the image with the NEW project's `--build-arg` values and rerun the
step 3 checklist against `bt-impact-academy`.

### 6. Full loop rehearsal on the new project
With the satellite running locally (`npm run dev` starts everything):
- Submit a mission as a learner on :3000
- Sign into the operator console on :3001 (Kamo created your account)
- Send to rover (fake driver), mark complete, attach any YouTube URL
- Confirm the learner side shows Completed with the video
This is the sign-off that the migration broke nothing.

### 7. Prep the yard satellite for the new project
- Fill `yard/satellite/.env` (copy `.env.example` there) with the new
  project's values from Kamo.
- Keep it ready to copy onto the satellite Pi before the next event.

### 8. WAIT POINT: needs Hlali's infra live
When the first staging deploy runs (push to main after infra is up):
- Watch the `Deploy staging` action go green.
- Open the staging URL from the workflow log and rerun the step 3 checklist
  against it.
- In Cloud Run console: check logs for startup errors, note cold start time.
- Report pass/fail in the group; this gates showing Werner.

### 9. Done when
- Image builds and runs locally with both old and new config.
- The full learner-to-operator loop works against `bt-impact-academy`.
- Staging URL passes the same checklist.
