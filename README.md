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

## Demo account

Anyone evaluating this local/demo deployment can sign in with:

| Field | Value |
| --- | --- |
| Username | `demo` |
| Password | `DemoCctv!2026` |

This account is intentionally public. Do **not** use it for real cameras or
private spaces. Create a separate account for personal use and change/remove
the demo account before making a production deployment public.

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

Open [http://localhost:3050](http://localhost:3050). Log in with the demo
account above, or register your own account.

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

## Device and browser compatibility

The app works on devices that provide a compatible browser and hardware. It is
not possible to guarantee every device model because browser support, camera
drivers, permissions, battery policies, and network rules differ.

| Device | Supported browsers | Notes |
| --- | --- | --- |
| Android phones/tablets | Current Chrome, Edge, Firefox | Good camera/monitor option. Keep the browser in the foreground for best reliability. |
| iPhone/iPad | Current Safari | Works on supported iOS/iPadOS versions; Safari may pause background tabs and requires user permission for media/audio. |
| Windows/macOS/Linux | Current Chrome, Edge, Firefox, Safari on macOS | Works with built-in or USB webcams and microphones. |
| Chromebooks | Current Chrome | Works when the device camera/microphone is available to Chrome. |
| Older browsers, feature phones, most smart-TV browsers | Not supported | Usually lack the required WebRTC or camera APIs. |

Camera and microphone access requires either `http://localhost` during local
development or HTTPS in a deployed environment. Browsers will block access on
an ordinary `http://` public address.

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

## Configuration

The server listens on port `3050` by default.

```bash
PORT=8080 SESSION_SECRET='replace-with-a-long-random-secret' npm start
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3050` | HTTP port for the application. |
| `SESSION_SECRET` | development fallback | Secret used to sign login sessions. Set a unique, long random value in production. |
| `NODE_ENV` | unset | Set to `production` behind HTTPS so session cookies are marked secure. |

## Vercel deployment

The repository includes a Vercel serverless backend in `api/index.js`. It uses
Neon Postgres for account/alert metadata, a **private** Vercel Blob store for
snapshots, signed HTTP-only JWT cookies for sessions, and Ably for realtime
camera presence and WebRTC signalling. This replaces the local filesystem,
in-memory sessions, and Socket.IO server that are used by `npm start`.

1. Create a Neon database through the Vercel Marketplace and add its connection
   string as `DATABASE_URL`.
2. Run [db/schema.sql](db/schema.sql) in Neon’s SQL editor.
3. In the Vercel project Storage tab, create a **private** Blob store. Vercel
   adds `BLOB_READ_WRITE_TOKEN` to the project environment automatically.
4. Create an Ably app and add a server API key as `ABLY_API_KEY`. Do not expose
   this key in browser code or use an `ABLY_API_KEY` prefixed with `NEXT_PUBLIC`.
5. Generate a random secret of at least 32 characters and add it as
   `SESSION_SECRET` for Production, Preview, and Development.
6. Import the repository into Vercel, or deploy with `vercel --prod` after
   linking the project. Vercel uses `vercel.json` to route `/api/*` to the
   serverless backend and serve the browser application from `public/`.

Use `.env.example` as a checklist. Never commit a real `.env.local` file or any
of these credentials. The deployed cookie is `Secure`, `HttpOnly`, and
`SameSite=Lax`, so the Vercel production URL must be accessed over HTTPS.

The old `backend/server.js` remains for local-only development. It is not the
Vercel production backend and must not be used to run a second deployment
against the Vercel database without a separate migration.

## Project layout

```text
api/index.js            Vercel serverless API, JWT auth, alert routes
backend/server.js       Legacy local Express + Socket.IO server
backend/db.js           Legacy JSON persistence for local server
backend/vercel-db.js    Neon Postgres persistence layer
backend/vercel-auth.js  Signed cookie authentication layer
backend/realtime.js     Ably token, presence, and alert publishing service
db/schema.sql           Neon database schema to run once before deployment
data/database.json      Local user and alert metadata database
data/alerts/            Private motion snapshot files (created at runtime)
public/                 Browser pages, styles, and client-side camera/monitor code
```

For local mode, user accounts and alert metadata are stored in
`data/database.json`. The Vercel deployment instead stores them in Neon
Postgres, with private snapshot files in Vercel Blob.

## Security notes

- Passwords are hashed with bcrypt.
- Cameras, monitors, alerts, and snapshot images are scoped to the signed-in
  account.
- Alert images are stored outside the public static directory and are served
  only through an authenticated API endpoint.
- Vercel sessions use signed, short-lived HTTP-only cookies; never reuse the
  development fallback secret in production.
- Run behind HTTPS, set `SESSION_SECRET`, and do not expose the demo account
  around real camera feeds.

## Development commands

```bash
npm start       # start the server
npm run dev     # restart the server automatically when backend files change
npm test        # run Node's test runner
npm audit       # check dependency advisories
```

## Current limitations / roadmap

The current project is workable for browser-based monitoring, but these are not
implemented yet:

- Native Android/iOS application and background recording
- Web push notifications when the monitor is closed
- Continuous video recording and cloud backup
- Motion schedules, zones, and person/pet detection
- Camera selection, torch, optical zoom, and device-specific controls
- TURN configuration UI and production deployment automation
- Automated end-to-end browser tests

## License

No license has been specified for this repository yet. Add one before sharing
or redistributing the project.
