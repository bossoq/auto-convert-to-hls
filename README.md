# auto-convert-to-hls

Automatically converts MP4 recordings to multi-rendition HLS for video-on-demand. Supports two ingestion sources: a watched filesystem directory and Google Meet recordings via Google Pub/Sub.

## Requirements

- Node.js ≥ 10 with Yarn
- PostgreSQL database
- Intel GPU with Quick Sync Video (QSV) support (used for hardware-accelerated transcoding)
- ffmpeg built with QSV support

## Setup

```bash
yarn
yarn backend prisma generate
```

Copy and configure environment variables (see [Environment Variables](#environment-variables) below).

## Running

**Development:**
```bash
yarn dev
```

**Production:**
```bash
yarn start
```

The web UI is served on port `3000`. The backend API and Socket.io run on `PORT` (default `4000`).

## Docker

```bash
docker compose up
```

The Docker image is based on `ghcr.io/bossoq/ffmpeg-node-16:2.0` which includes ffmpeg with QSV support. Mount your source and destination directories as volumes.

Pre-built images are published to `ghcr.io/bossoq/auto-convert-to-hls`:
- Every commit is tagged with a short SHA
- Releases are tagged with the version from `package.json` (triggered by opening a PR with the `release` label)

## How It Works

### Ingestion

**Filesystem watcher:** Chokidar watches the `SOURCE` directory for new `.mp4` files. Files in the `google/` subdirectory and hidden files are ignored. A 10-second debounce ensures the file is fully written before transcoding begins.

**Google Meet (Pub/Sub):** Listens for `google.workspace.meet.recording.v2.fileGenerated` events. Downloads the recording from Google Drive into `SOURCE/google/`, then enqueues it. On startup, any previously unprocessed records in the database are replayed automatically.

### Transcoding

Jobs are processed one at a time. For each MP4:

1. Output directory created under `DEST`
2. HLS master playlist (`index.m3u8`) written
3. Thumbnail captured at 00:00:10 as `cover.jpg`
4. Transcoded to four renditions using Intel QSV (`h264_qsv`):

   | Resolution | Video bitrate | Audio bitrate |
   |---|---|---|
   | 360p | 800k | 96k |
   | 480p | 1400k | 128k |
   | 720p | 2800k | 128k |
   | 1080p | 5000k | 192k |

5. Source file moved to a `converted/` subdirectory

For Google Meet recordings with `autoPublish` enabled, the job also marks the `videoProcess` record as processed and creates a `videoTable` entry in the database.

### API

| Endpoint | Description |
|---|---|
| `GET /status` | Current job name, frame progress, FPS, speed |
| `GET /queue` | Pending queue length and job list |

Socket.io emits `status` and `queue` events on every state change, used by the web UI for live updates.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SOURCE` | `/source/` | Directory to watch for incoming MP4 files |
| `DEST` | `/dest/` | Output directory for HLS segments and playlists |
| `PORT` | `4000` | Backend API / Socket.io port |
| `CORSHOST` | `https://vodstatus.picturo.us` | Allowed CORS origin for the backend |
| `DATABASE_URL` | — | Prisma primary PostgreSQL connection string |
| `DIRECT_URL` | — | Prisma direct PostgreSQL connection string |
| `PROJECT_ID` | — | Google Cloud project ID |
| `TOPIC_NAME` | — | Pub/Sub topic name |
| `SUBSCRIPTION_NAME` | — | Pub/Sub subscription name |
| `CLIENT_EMAIL` | — | Service account email |
| `PRIVATE_KEY` | — | Service account private key |
| `SUBJECT` | — | Domain-wide delegation subject (impersonated user) |

## License

MIT
