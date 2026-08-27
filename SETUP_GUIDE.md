# Deployment & Setup Guide — OZ Rent A Plane

This guide provides simple, step-by-step instructions in plain language for setting up **Scheduled Cron Jobs** and **Real-time Updates (Socket.io / Supabase Realtime)** on Vercel.

---

# PART 1: Cron Jobs Setup on Vercel

### What These Cron Jobs Do
- **Email Outbox (`/api/cron/email-outbox`)**: Sends queued customer/admin emails every 5 minutes.
- **Flight Reminders (`/api/cron/day-before-flights`)**: Runs daily every morning (Sydney time) to remind pilots of tomorrow's flights.
- **Daily Maintenance (`/api/cron/daily-maintenance`)**: Runs daily every morning (Sydney time) to mark overdue flight records, expire temporary calendar holds, send document expiry reminders (30/14/7/1 days), alert admin if a new user hasn't requested checkout after 24 hours, and chase unpaid invoices.

---

### Step 1: Add `CRON_SECRET` to Vercel
Vercel Cron protects your endpoints by sending a secret password header (`Authorization: Bearer <CRON_SECRET>`) with each call.

1. Open your [Vercel Dashboard](https://vercel.com).
2. Click on your project: **`oz-rentaplane-m4`** (the one connected to `https://www.ozrentaplane.com`).
3. Go to **Settings** (top menu) → **Environment Variables** (left sidebar).
4. Add a new variable:
   - **Key**: `CRON_SECRET`
   - **Value**: Generate a random secure string (for example: `c9f3b8e1a742d05f6e8a1c3b5d7e9f0123456789abcdef0123456789abcdef01`).
   - **Environments**: Check **Production**, **Preview**, and **Development**.
5. Click **Save**.

---

### Step 2: Push Code to GitHub
Push your latest changes to GitHub:
```bash
git add .
git commit -m "feat: configure vercel cron schedules"
git push origin main
```
Vercel will automatically build and deploy. It will read `vercel.json` from the root directory and register all 3 cron schedules.

---

### Step 3: Verify in Vercel
1. In your Vercel Project Dashboard, go to **Settings** → **Cron Jobs** in the left menu.
2. You will see the active jobs:
   - `/api/cron/email-outbox`
   - `/api/cron/day-before-flights`
   - `/api/cron/daily-maintenance`

---

### 💡 Note for Vercel Hobby Plan (Free Account)
- On the **Hobby (Free) Plan**, Vercel allows crons to run **once per day**. This is fine for the two daily jobs (`day-before-flights` and `daily-maintenance`).
- To make the email outbox drain **every 5 minutes** for free without upgrading to Vercel Pro:
  1. Create a free account at [cron-job.org](https://cron-job.org).
  2. Click **Create Cronjob**.
  3. **URL**: `https://www.ozrentaplane.com/api/cron/email-outbox`
  4. **Schedule**: Every 5 minutes.
  5. **Headers**: Add header `Authorization` with value `Bearer YOUR_CRON_SECRET`.
  6. Click **Create**.

---

# PART 2: Real-time Updates Setup (Socket.io vs Supabase Realtime)

### Why Socket.io Cannot Run Directly on Vercel
Vercel is a **serverless** platform. Next.js functions start up when a page/API is requested, do their work in a few milliseconds, and shut down. They **cannot** maintain open WebSocket connections 24/7 or keep a persistent Node.js server running on port 3001.

You have two clean options depending on your hosting preference:

---

## Option A: Keep Socket.io (Host on Render or Railway — Recommended if keeping existing code)

In this setup, your Next.js app stays on Vercel, and only the standalone `realtime/server.ts` runs on Render.com (free / $7 tier).

### Step 1: Deploy `realtime/server.ts` on Render.com
1. Go to [render.com](https://render.com) and create a **Web Service** connected to your repository `OZRentaplane-m4`.
2. Configure settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run realtime`
3. Add Environment Variables in Render:
   - `NEXT_PUBLIC_SUPABASE_URL`: *(Your Supabase URL)*
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: *(Your Supabase Anon Key)*
   - `SUPABASE_SERVICE_ROLE_KEY`: *(Your Supabase Service Role Key)*
   - `SOCKET_EMIT_SECRET`: *(A random secret string, e.g. `my-production-socket-secret-xyz`)*
   - `APP_URL`: `https://www.ozrentaplane.com`
   - `NEXT_PUBLIC_APP_URL`: `https://www.ozrentaplane.com`
4. Click **Deploy**. Render will provide a public URL (e.g. `https://ozrentaplane-realtime.onrender.com`).

### Step 2: Add Socket Variables to Vercel
Go to your **Vercel Project Settings → Environment Variables** and add:
- `NEXT_PUBLIC_SOCKET_URL` = `https://ozrentaplane-realtime.onrender.com`
- `SOCKET_URL` = `https://ozrentaplane-realtime.onrender.com`
- `SOCKET_EMIT_SECRET` = `my-production-socket-secret-xyz` *(must match Render)*

Redeploy Vercel. Now when any action happens, Vercel tells your Render socket server, which instantly pushes live updates to connected browsers.

---

## Option B: 100% Hosted on Vercel using Supabase Realtime (No External Server Needed)

If your goal is: **"I want everything hosted 100% on Vercel with zero external Node servers (no Render, no Railway)"**, then **Supabase Realtime** is the ideal solution.

### How It Works
Since your database is already Supabase (PostgreSQL):
1. Browsers connect directly to Supabase's built-in WebSocket channel using the Supabase client.
2. Whenever a database row changes in `bookings`, `verification_events` (chat/notifications), or `user_documents`, Supabase instantly pushes the update to the browser.
3. Next.js on Vercel just writes to Supabase as normal — no need for `/internal/emit` or a custom server.

### Architecture Comparison

| Feature | Option A: Custom Socket.io (Render) | Option B: Supabase Realtime (100% Vercel) |
|---------|--------------------------------------|-------------------------------------------|
| **Hosting** | Vercel + Render/Railway server | **100% Vercel + Supabase** (No extra server) |
| **Maintenance** | Need to monitor the Render process | Zero server management |
| **Code Required** | Existing code in `realtime/` | Replace Socket hooks with `supabase.channel()` |
| **Cost** | Free tier or $7/mo on Render | Included with your Supabase plan |

---

## Summary Checklist for Deployment

- [ ] **Cron Step 1**: Set `CRON_SECRET` in Vercel Environment Variables.
- [ ] **Cron Step 2**: Push code to GitHub `main` branch.
- [ ] **Cron Step 3**: Confirm crons in Vercel **Settings > Cron Jobs**.
- [ ] **Realtime**:
  - If using **Option A (Socket.io)**: Deploy `realtime/server.ts` on Render, set `NEXT_PUBLIC_SOCKET_URL`, `SOCKET_URL`, and `SOCKET_EMIT_SECRET` in Vercel.
  - If using **Option B (Supabase Realtime)**: Keep everything on Vercel and let Supabase handle live WebSocket broadcasts.
