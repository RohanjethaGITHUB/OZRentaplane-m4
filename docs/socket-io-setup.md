# Socket.io realtime — local setup

OZ Rent A Plane uses a **dedicated Socket.io Node process** (no Redis). Next.js server actions and the Stripe webhook emit via HTTP `POST /internal/emit` with a shared secret. Browsers connect with `socket.io-client`.

See also: [`socket-io-integration-map.md`](./socket-io-integration-map.md), [`socket-io-implementation-prompt.md`](./socket-io-implementation-prompt.md).

## Env vars

Add to `.env.local` (see `.env.example`):

```env
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
SOCKET_URL=http://localhost:3001
SOCKET_EMIT_SECRET=replace-me-long-random
```

| Var | Used by |
|-----|---------|
| `NEXT_PUBLIC_SOCKET_URL` | Browser client |
| `SOCKET_URL` | Next.js emit helper (`lib/realtime/emit.ts`) |
| `SOCKET_EMIT_SECRET` | Next.js → socket `/internal/emit` auth |
| `SOCKET_PORT` | Optional listen port (default `3001`) |

If `NEXT_PUBLIC_SOCKET_URL` / `SOCKET_URL` / `SOCKET_EMIT_SECRET` are missing, realtime is a **no-op** — all mutations still succeed (fail-open).

## Run locally

`npm run dev` starts **both** Next.js (`:3000`) and the Socket.io process (`:3001`):

```bash
npm run dev
```

| Script | What it starts |
|--------|----------------|
| `npm run dev` | Next + Socket.io (normal local workflow) |
| `npm run dev:next` | Next only (realtime UI updates stay off / fail-open) |
| `npm run realtime` | Socket.io only |

Health check: `GET http://localhost:3001/health`

## Architecture

```
[Browser]  ←── WebSocket ──→  [realtime/server.ts]
                                     ↑
                          POST /internal/emit (SOCKET_EMIT_SECRET)
                                     ↑
[Next.js actions / Stripe webhook] → lib/realtime/emit.ts
```

- Clients authenticate with the Supabase access token (`handshake.auth.token`).
- Rooms: `admin:ops`, `user:{id}`, `booking:{id}`, `thread:{id}`.
- Payloads are thin (ids + type). UI refreshes from Supabase / RSC via debounced `router.refresh()`.

## Manual test checklist

Use existing test accounts (do not put passwords in docs).

1. **Chat:** admin sends → customer tab updates; customer replies → admin inbox updates; unread badges move both ways.
2. **Docs:** customer submits → admin queue/badge updates; admin rejects → customer documents refresh.
3. **Checkout:** customer requests → admin queue; admin confirms/outcome → customer dashboard/checkout updates.
4. **Booking:** create → admin sees; admin confirm/dispatch → customer booking detail updates.
5. **Flight record:** customer submit → admin post-flight; admin clarification → customer; approve → customer.
6. **Bank transfer:** customer proof → admin; admin approve → customer payment state.
7. **Stripe:** complete test payment with `stripe listen` → both UIs update without reload.
8. **Degrade:** stop socket server → actions still succeed; UI just doesn’t live-update.
9. **Auth:** customer cannot join another user’s `thread:` or `booking:` room.

## Intentional P3 notes

- **Calendar:** refreshed via `ops:queue` / `booking:status` (layout + `CalendarRealtimeListener`). No separate calendar-specific event type.
- **Aircraft multi-admin:** deferred — same `admin:ops` refresh is enough for now.
- **Redis:** not used and must not be added.

## Flow coverage

Checklist lives in [`socket-io-integration-map.md`](./socket-io-integration-map.md) (updated when flows are verified).
