# SASTA CCTV

SASTA CCTV is a browser-based DIY camera system. Sign in on one device as a
**Camera** and on another as a **Monitor** to view live video/audio, use
push-to-talk, detect motion, save motion snapshots, trigger a siren, and review
the alert history. It is designed for reusing an old phone, tablet, laptop, or
desktop webcam as a camera.

> This is a web application, not a native Android/iOS app. It needs a modern
> browser, camera permission, and a secure connection when it is not running on
> `localhost`.

## Features

- Account-based camera and monitor pairing
- WebRTC live video and audio between signed-in devices
- Multi-camera monitor dashboard
- Browser-side motion detection with snapshot alerts
- Private, account-scoped alert images and alert deletion
- Push-to-talk audio, remote siren, digital zoom, and night-vision filter
- Responsive UI for mobile and desktop browsers

## Accounts

There is no shipped default account, and no credentials are published in this
repository. Start the server, open the app, and use **Register** to create your
own account. Every camera, monitor, alert, and snapshot is scoped to the
account that created it.

If you need a throwaway account for evaluation, register one locally and delete
it when you are done. Never reuse a password from anywhere else, and do not
create shared or well-known credentials on a deployment that is reachable from
the internet.

## Requirements

- Node.js 18 or newer (Node 20 LTS is recommended)
- npm
- A current browser with WebRTC and `getUserMedia` support
- Two devices or two separate browser sessions signed into the same account
- Internet/LAN access between devices for remote use

## Quick start

```bash
npm install
npm start
```

Open [http://localhost:3050](http://localhost:3050) and select **Register** to
create an account.

### Use it as a camera

1. On the device that will act as the camera, open **Camera Console**.
2. Give it a useful name, such as `Front Door`.
3. Select **Start Camera** and allow the browser to use the camera and
   microphone.
4. Leave that tab open and keep the device awake/connected.

### Use it as a monitor

1. On another device or browser session, log in with the same account.
2. Open **Web Monitor**.
3. Select the online camera; a single online camera is selected automatically.
4. Use the zoom, night-vision, siren, alert history, and push-to-talk controls
   as needed.

For a realistic test, use two physical devices. A single device generally
cannot use its camera and reliably monitor the same live stream at once.

## Vercel deployment (production)

The repository includes a Vercel serverless backend in `api/index.js`. It uses
Neon Postgres for account/alert metadata, a **private** Vercel Blob store for
snapshots, signed HTTP-only JWT cookies for sessions, and Ably for realtime
camera presence and WebRTC signalling.

### Step 1 — Push to GitHub

```bash
git add -A
git commit -m "Deploy to production"
git push origin main
```

### Step 2 — Create a Neon database

1. Go to [console.neon.tech](https://console.neon.tech) and create a project.
2. Open the **SQL Editor** and run `db/schema.sql`.
3. Copy the connection string — it looks like:
   ```
   postgresql://neondb_owner:xxxxx@ep-xxx.neon.tech/neondb?sslmode=require
   ```

### Step 3 — Create a Vercel Blob store

1. In your Vercel project dashboard, go to **Storage** → **Create Store** → **Blob**.
2. Choose **Private** (alert images must stay private).
3. Vercel automatically adds `BLOB_READ_WRITE_TOKEN` to your environment.

### Step 4 — Create an Ably account

1. Go to [ably.com](https://ably.com) and create an app.
2. Go to **Settings → API Keys** and copy the **Full API Key**.
3. **Never expose this key in browser code** — it's only used server-side.

### Step 5 — Set environment variables

In Vercel dashboard → **Settings → Environment Variables**, add:

| Variable | Value | Where |
|----------|-------|-------|
| `DATABASE_URL` | Neon connection string | Production, Preview, Development |
| `ABLY_API_KEY` | Ably full API key | Production, Preview, Development |
| `SESSION_SECRET` | Random 32+ char string | Production, Preview, Development |

Generate a session secret:
```bash
openssl rand -hex 32
```

### Step 6 — Deploy

```bash
# Via Vercel CLI (first time links the project)
vercel --prod

# Or just push to GitHub — auto-deploys if connected
git push origin main
```

### Step 7 — Verify

| Endpoint | Method | Expected |
|----------|--------|----------|
| `https://your-app.vercel.app/` | GET | Landing page |
| `https://your-app.vercel.app/api/auth/session` | GET | `{"loggedIn":false}` |
| `https://your-app.vercel.app/api/alerts` | GET | `401` (unauthenticated) |

## Configuration

### Local development

The server listens on port `3050` by default.

```bash
PORT=8080 SESSION_SECRET='replace-with-a-long-random-secret' npm start
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3050` | HTTP port for the application. |
| `SESSION_SECRET` | development fallback | Secret used to sign login sessions. Set a unique, long random value in production. |
| `NODE_ENV` | unset | Set to `production` behind HTTPS so session cookies are marked secure. |

### Vercel production

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon Postgres connection string |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob access token (auto-added) |
| `ABLY_API_KEY` | Ably server API key for realtime |
| `SESSION_SECRET` | JWT signing secret (min 32 chars) |

See `.env.example` for a checklist. Never commit `.env.local` or any credentials.

## Architecture

### Local mode (`npm start`)

```
browser → Express + Socket.IO → data/database.json + data/alerts/
```

### Vercel mode (production)

```
browser → api/index.js (serverless)
              ├── Neon Postgres    (users, alerts metadata)
              ├── Vercel Blob      (private alert images)
              └── Ably             (camera presence, WebRTC signalling)
```

### How the pieces connect

```
Camera device (camera.html)
  ├── Loads Ably SDK from CDN
  ├── realtime.js → /api/realtime-token → Ably (scoped token)
  ├── Registers in Ably presence channel
  ├── Motion detected → POST /api/alerts/upload
  │   ├── Saves image to Vercel Blob (private)
  │   ├── Saves metadata to Neon Postgres
  │   └── Publishes alert via Ably channel
  └── WebRTC signalling via Ably messages

Monitor device (monitor.html)
  ├── Loads Ably SDK from CDN
  ├── Gets camera list from Ably presence
  ├── Receives motion alerts via Ably channel subscription
  ├── Fetches alert list from /api/alerts (Neon)
  ├── Fetches alert images from /api/alerts/:id/image (Vercel Blob)
  └── WebRTC peer connection to camera (P2P)
```

## Project layout

```
api/index.js              Vercel serverless API (Express, JWT auth, alert routes)
backend/server.js         Local Express + Socket.IO dev server
backend/db.js             Local JSON file persistence (dev only)
backend/vercel-db.js      Neon Postgres queries (production)
backend/vercel-auth.js    Signed cookie JWT authentication (production)
backend/realtime.js       Ably token, presence, and alert publishing (production)
db/schema.sql             Neon database schema (run once)
public/                   Browser pages, styles, and client-side code
public/js/auth.js         Session management
public/js/realtime.js     Ably adapter (browser-side)
public/js/monitor.js      Monitor logic (WebRTC, alerts)
public/js/camera.js       Camera logic (streaming, motion detection)
test/db.test.js           Database unit tests (23 tests)
test/api.test.js          API integration tests (26 tests)
scripts/clean-test-data.js Utility to purge test data from local database
data/database.json        Local user/alert metadata (dev only)
data/alerts/              Local alert image files (dev only)
```

## Testing

Run the full test suite:

```bash
npm test
```

This runs Node's built-in test runner across `test/db.test.js` (23 unit tests)
and `test/api.test.js` (26 integration tests).

### Test coverage

| Area | Tests | What's tested |
|------|-------|---------------|
| `db.js` | 23 | User CRUD, password hashing, alert CRUD, file path resolution, input validation |
| API routes | 26 | Auth flow (register, login, logout, session), 401 enforcement, alert upload/list/delete, security headers |

### Cleaning test data

Test runs create temporary users in `data/database.json`. Clean them with:

```bash
node scripts/clean-test-data.js
```

## Networking and remote viewing

Live media is peer-to-peer WebRTC. The included public STUN servers work on
many home and office networks, but not all of them. Remote streams can fail on
carrier-grade NAT, restrictive corporate Wi-Fi, or firewalls that block WebRTC.

For reliable public/production remote viewing, configure your own authenticated
TURN server and replace the `iceServers` settings in:

- `public/js/camera.js`
- `public/js/monitor.js`

The application server only handles login, device discovery, alerts, and WebRTC
signalling; it does not relay the video stream by itself.

## Device and browser compatibility

| Device | Supported browsers | Notes |
| --- | --- | --- |
| Android phones/tablets | Current Chrome, Edge, Firefox | Good camera/monitor option. Keep the browser in the foreground. |
| iPhone/iPad | Current Safari | Safari may pause background tabs and requires user permission. |
| Windows/macOS/Linux | Current Chrome, Edge, Firefox, Safari on macOS | Works with built-in or USB webcams. |
| Chromebooks | Current Chrome | Works when device camera/mic is available. |
| Older browsers, feature phones, smart-TV browsers | Not supported | Usually lack required WebRTC or camera APIs. |

Camera and microphone access requires `http://localhost` during development or
HTTPS in production. Browsers block access on plain `http://` public addresses.

## Development commands

```bash
npm start       # start the local server
npm run dev     # restart automatically when backend files change
npm test        # run the test suite
npm audit       # check dependency advisories
```

## Security notes

- Passwords are hashed with bcrypt.
- Cameras, monitors, alerts, and snapshot images are scoped to the signed-in account.
- Alert images are stored outside the public directory and served only through authenticated API endpoints.
- Vercel sessions use signed, short-lived HTTP-only cookies.
- All frontend API calls include `credentials: 'same-origin'` for reliable session handling.
- Never reuse the development `SESSION_SECRET` fallback in production.

## Current limitations / roadmap

- Native Android/iOS application and background recording
- Web push notifications when the monitor is closed
- Continuous video recording and cloud backup
- Motion schedules, zones, and person/pet detection
- Camera selection, torch, optical zoom, and device-specific controls
- TURN configuration UI and production deployment automation

## License

No license has been specified for this repository yet. Add one before sharing
or redistributing the project.
