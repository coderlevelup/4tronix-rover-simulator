# syntax=docker/dockerfile:1
# Mission Control (learner-facing hub) for Cloud Run.
#
# Two stages: a full Node build, then a slim runtime holding only Next's
# standalone output. The app is stateless (all state in Firestore), so any
# number of instances can run behind Cloud Run's autoscaler.
#
# NEXT_PUBLIC_* values inline into the client bundle at BUILD time. They are
# the public Firebase web config (safe in the browser, not secrets), passed as
# --build-arg by the deploy workflow. Server secrets (FIREBASE_* admin
# credentials) are NEVER baked in; Cloud Run mounts them from Secret Manager
# at runtime.

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
# Absolute base for links in outgoing emails. NEXT_PUBLIC_* is inlined at build
# time, so this cannot be supplied as a Cloud Run runtime env var - unset here
# means every email CTA points at http://localhost:3000.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID

RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Standalone bundle: server.js + the pruned node_modules it needs.
COPY --from=build /app/.next/standalone ./
# Client assets are served by the same server but live outside the bundle.
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

USER node

# Cloud Run injects PORT; Next's standalone server honors it. 8080 is the
# local-run default (docker run -p 8080:8080).
ENV PORT=8080 HOSTNAME=0.0.0.0
EXPOSE 8080

CMD ["node", "server.js"]
