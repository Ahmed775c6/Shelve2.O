# Shelve

Shelve uses a React frontend, a Go + PostgreSQL API for account data, and a
Tauri v2 desktop app with a Rust-managed SQLite database for offline use.

## Data storage

- When signed in, both Web and Desktop read and write library data directly to
  the Go API; PostgreSQL is the shared source of truth.
- Desktop Offline mode stores books, notes, writings, reading plans, reading
  sessions, and progress in `shelve.db` under Tauri's app data directory.
- If the desktop app cannot reach the API while starting in Cloud mode, it
  opens the local library in Offline mode; switch back to Cloud in Settings
  after reconnecting to sync.
- Offline changes are merged into the signed-in account on login or reconnect.
- The Web app requires an account and is online-only; it cannot access the
  desktop SQLite database.
- Browser `localStorage` is limited to lightweight session/mode/theme settings,
  not library data.

## Reading plans and reminders

The Reading Planner shows recurring plan dates on a monthly calendar and
tracks completed books and page progress. On desktop, enabled reminders are
stored locally and scheduled by Rust through the user's OS scheduler
(systemd user timers on Linux, launchd on macOS, and Task Scheduler on
Windows). They can fire while Shelve is closed; the desktop session must be
available to display the notification. Cloud plans remain on the API, but
reminder delivery is local and does not use server notifications.

See [Go_Api/README.md](https://github.com/Ahmed775c6/shelve2.O_Api) for API configuration and routes.
Set `VITE_API_BASE_URL` to the Go API origin when it is not
`http://localhost:8080`; configure the API's `CORS_ORIGINS` for the Web app's
origin.

## Development

Install frontend dependencies with `pnpm install`. The Go API can be started
from `Go_Api` with `go run ./cmd/shelve`; its `.env` must provide a valid
`JWT_SECRET` and a reachable PostgreSQL instance.

Fast checks:

```sh
pnpm tsc --noEmit
(cd src-tauri && cargo check)
(cd ../Go_Api && go build ./...)
```
