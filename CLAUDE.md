# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

This is a Yarn workspaces monorepo. Run all commands from the repo root.

**Development:**
```bash
yarn dev              # run backend (ts-node-dev) and web (svelte-kit dev) concurrently
yarn backend-dev      # backend only, with hot reload
yarn web-dev          # web only
```

**Production:**
```bash
yarn start            # generate Prisma client, then run backend + built web (port 3000)
```

**Web workspace:**
```bash
yarn web lint         # prettier + eslint check
yarn web format       # prettier auto-fix
yarn web check        # svelte-check type checking
```

**Testing:**
```bash
yarn test              # run backend tests once
yarn test:watch        # vitest watch mode
```

**Database:**
```bash
yarn backend prisma generate   # regenerate Prisma client after schema changes
yarn backend prisma migrate dev  # run migrations in development
```

**Docker:**
```bash
docker compose up     # build and run via docker-compose.yaml
```

## Architecture

### Overview

The system automatically converts MP4 recordings to multi-rendition HLS for video-on-demand. There are two ingestion paths that both feed a single sequential transcoding queue.

### Backend (`backend/src/`)

**Ingestion path 1 — filesystem watcher** (`watcher/watcher.ts`): Chokidar watches the `SOURCE` directory (default `/source/`) for new `.mp4` files. Hidden files and files under `google/` are excluded. A 10-second debounce in `index.ts` waits for file transfers to complete before enqueuing.

**Ingestion path 2 — Google Pub/Sub** (`watcher/pubsub.ts`): Listens for `google.workspace.meet.recording.v2.fileGenerated` events. On receipt, downloads the recording from Google Drive into `SOURCE/google/`, then enqueues it for transcoding. On startup, `getAllUnfinished()` replays any records in Prisma with `downloaded=false` or `processed=false`.

**Transcoder** (`ffmpeg/ffmpeg.ts`): A singleton `Transcoder` class with an internal queue. Jobs are processed one at a time. For each job it:
1. Creates the output directory under `DEST`
2. Writes an HLS master playlist (`index.m3u8`)
3. Spawns three concurrent worker threads: `fpscheck-worker.ts` + `framecount-worker.ts` (for progress tracking), `screenshot-worker.ts` (cover image at 00:00:10), and `transcode-worker.ts` (actual encoding)
4. Transcodes to 4 renditions (360p/480p/720p/1080p) using NVIDIA cuvid hardware acceleration (`h264_cuvid`)
5. Moves the source file to a `converted/` subdirectory
6. If `autoPublish=true`, marks `videoProcess.processed=true` and creates a `videoTable` record in Postgres (base URL from `VOD_BASE_URL` env var)

After each transcode step, progress is broadcast to all connected Socket.io clients.

**API** (`api/express.ts`): Express server with Socket.io. Two REST endpoints: `GET /status` (current job progress) and `GET /queue` (pending jobs). Socket.io emits `status` and `queue` events on every state change, and pushes current state to each client immediately on `connection`.

### Web (`web/src/`)

SvelteKit frontend. Connects to the backend via Socket.io (URL from `PUBLIC_SOCKET_URL` env var, defaults to same origin) to display live transcoding status and queue. Built with Tailwind CSS.

### Database (Prisma + PostgreSQL)

Key models:
- `videoProcess` — tracks Google Meet recordings: `spaceName`, `downloaded`, `processed`, `participants`, `className`
- `videoTable` — published VOD entries with `baseUrl`, `allowList`, `fileType`
- `userTable` / `postTable` — user/content management shared with a broader platform

### Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `SOURCE` | `/source/` | Input directory for MP4 files |
| `DEST` | `/dest/` | Output directory for HLS segments |
| `PORT` | `4000` | Backend API/Socket.io port |
| `CORSHOST` | `https://vodstatus.picturo.us` | Allowed CORS origin |
| `DATABASE_URL` | — | Prisma primary connection string |
| `DIRECT_URL` | — | Prisma direct connection string |
| `PROJECT_ID` | — | Google Cloud project ID |
| `TOPIC_NAME` | — | Pub/Sub topic name |
| `SUBSCRIPTION_NAME` | — | Pub/Sub subscription name |
| `CLIENT_EMAIL` | — | Service account email |
| `PRIVATE_KEY` | — | Service account private key |
| `SUBJECT` | — | Domain-wide delegation subject |
| `VOD_BASE_URL` | `https://vod.supapanya.com` | Base URL for auto-published VOD entries |
| `PUBLIC_SOCKET_URL` | _(same origin)_ | Socket.io server URL consumed by the web UI (`web/.env.public`) |

### Docker & CI

`docker-compose.yaml` mounts host paths and uses `runtime: nvidia`, passing `NVIDIA_VISIBLE_DEVICES`/`NVIDIA_DRIVER_CAPABILITIES` to the container.

Two GitHub Actions workflows:
- `.github/workflows/docker.yml` — builds and pushes to `ghcr.io/bossoq/auto-convert-to-hls` on every push to `main`, tagged with short SHA and `latest`
- `.github/workflows/test.yml` — runs `yarn test` (Vitest, 37 tests) on every push and PR to `main`

### Testing

Tests live in `backend/src/__tests__/`. All tests mock Worker threads, PrismaClient, and fs — no GPU, database, or ffmpeg required to run them.

### Hardware Dependency

The transcoder requires an NVIDIA GPU. It decodes with `-hwaccel cuvid` / `h264_cuvid` and encodes with `h264_nvenc` (see `default-renditions.ts` and `transcode-worker.ts`).
