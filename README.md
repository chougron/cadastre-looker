# cadastreLooker

Explore French cadastre parcels by size (`contenance`, in m²) on an interactive map,
with a Google Maps link to each match.

## Data

Place cadastre GeoJSON files in this directory, named `cadastre-<CITY_ID>-parcelles.json`
(`<CITY_ID>` is the INSEE commune code). Each feature must have a `properties.contenance`
field (parcel area in m²) and a `Polygon`/`MultiPolygon` geometry.

## Usage

This project uses Node.js (version pinned in `.nvmrc`). With `nvm` installed:

```
nvm use
npm install
npm run dev
```

Then open http://localhost:3000, pick a city, enter a target parcel size and a tolerance
(± m²), and search. Matching parcels are drawn on the map and listed in the sidebar, each
with a Google Maps link.

For a production build:

```
npm run build
npm start
```

## Deploying to AWS (free tier)

Infrastructure is defined with Pulumi in `infra/` — an S3 static website for the frontend,
and a Lambda function behind an API Gateway HTTP API for the `/api/*` routes. Both fit
comfortably in AWS's free tier for low traffic (S3 and API Gateway are free for the first
12 months; Lambda's 1M requests / 400,000 GB-s per month is permanent).

Prerequisites:

- An AWS account with credentials available locally (`aws configure`, or the usual
  `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` env vars).
- The [Pulumi CLI](https://www.pulumi.com/docs/install/) (already installed in this
  environment under `~/.pulumi/bin`, added to `PATH` in `.bashrc`).
- Pulumi needs somewhere to store deployment state. Either log in to Pulumi Cloud
  (`pulumi login`, free) or use a local backend with no account at all:
  `pulumi login --local`.

Deploy:

```
cd infra
npm install
pulumi stack init dev          # first time only
pulumi config set aws:region eu-west-3   # or your preferred region
pulumi up
```

`pulumi up` also runs `npm run build:lambda` in the parent project automatically, so it
always deploys the current code. On success it prints two outputs:

- `websiteUrl` — the S3 static website (HTTP only; add CloudFront later for HTTPS/a
  custom domain)
- `apiUrl` — the API Gateway endpoint backing the frontend

To tear everything down: `pulumi destroy`.
