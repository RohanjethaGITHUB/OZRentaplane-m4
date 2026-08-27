# Step-by-Step Vercel Cron Setup Guide — OZRentAPlane

This guide walks you through configuring and deploying scheduled cron jobs on **Vercel** for the OZRentAPlane app.

---

## 1. How Vercel Cron Works

```
┌────────────────────────────────────────────────────────┐
│                      Vercel Cron                       │
│     (Reads schedules defined in vercel.json)           │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ HTTP GET + Header:
                            │ "Authorization: Bearer <CRON_SECRET>"
                            ▼
┌────────────────────────────────────────────────────────┐
│            Next.js App API Route Handler               │
│             /api/cron/[job]                            │
│                                                        │
│  1. Validates CRON_SECRET authorization header         │
│  2. Executes the job logic in Sydney timezone (AEST)  │
│  3. Returns JSON { ok, durationMs, stats }             │
└────────────────────────────────────────────────────────┘
```

---

## 2. Step 1: Set `CRON_SECRET` in Vercel Dashboard

Vercel Cron automatically includes an `Authorization: Bearer <CRON_SECRET>` header in every request when `CRON_SECRET` is set in your project environment variables.

### A. Generate a Secure Secret
In your terminal or PowerShell, generate a random string:
```bash
# On Mac/Linux:
openssl rand -hex 32

# Or in Node / PowerShell:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
*Example secret:* `8f2a9b3c4d5e6f708192a3b4c5d6e7f80112233445566778899aabbccddeeff0`

### B. Add to Vercel Environment Variables
1. Go to [vercel.com](https://vercel.com) and log in.
2. Select your **OZRentAPlane** project.
3. Click on **Settings** (top navigation).
4. Click on **Environment Variables** in the left sidebar.
5. Add the following new variable:
   - **Key**: `CRON_SECRET`
   - **Value**: *(Paste your generated random string)*
   - **Environments**: Check **Production**, **Preview**, and **Development**.
6. Click **Save**.

> [!TIP]
> Also add `CRON_SECRET=<your-secret>` to your local `.env.local` file for testing locally.

---

## 3. Step 2: Deploy to Vercel

Push your code to your GitHub repository or deploy via the Vercel CLI:
```bash
git add .
git commit -m "feat: implement Vercel Cron scheduled framework"
git push origin main
```

Once the deployment completes:
1. In your Vercel Project Dashboard, click the **Settings** tab.
2. Click **Cron Jobs** in the left sidebar.
3. You will see the 3 registered cron schedules automatically detected from `vercel.json`:
   - `/api/cron/email-outbox` (Every 5 minutes)
   - `/api/cron/day-before-flights` (Daily at 21:00 UTC ≈ 07:00 / 08:00 Sydney morning)
   - `/api/cron/daily-maintenance` (Daily at 22:00 UTC ≈ 08:00 / 09:00 Sydney morning)

---

## 4. Configured Cron Jobs Summary

| Job Endpoint | Schedule (UTC) | Schedule (Sydney AEST/AEDT) | Purpose |
|--------------|----------------|-----------------------------|---------|
| `/api/cron/email-outbox` | `*/5 * * * *` (every 5 min) | Every 5 minutes | Drains queued emails from Postgres `email_outbox` and sends via Resend. |
| `/api/cron/day-before-flights` | `0 21 * * *` (daily) | ~07:00 / 08:00 AM | Scans bookings scheduled for tomorrow in Sydney and queues reminder emails with pre-flight checklist. |
| `/api/cron/daily-maintenance` | `0 22 * * *` (daily) | ~08:00 / 09:00 AM | Bundled daily sweeps:<br>1. **Overdue flight records**: marks bookings past `scheduled_end` with no flight record.<br>2. **Stale temporary holds**: expires temporary hold blocks.<br>3. **Document expiry alerts**: notifies customer (30/14/7/1 days) AND alerts admin at 1 day before expiry / expired.<br>4. **New user inactivity alert**: alerts admin after 24h if a new user created an account and did not request a checkout flight.<br>5. **Unpaid invoice chase**: sends payment reminder to customer and alert to admin for invoices outstanding > 24h.<br>6. **Block-time maintenance**: expires packages and sends 7-day reminders. |

---

## 5. Vercel Plan Considerations (Hobby vs Pro)

### If you are on Vercel Pro:
- All crons in `vercel.json` run automatically out of the box (including the 5-minute outbox drain).
- No further action required.

### If you are on Vercel Hobby (Free):
- Vercel Hobby limits cron jobs to **once per day** per cron path.
- The daily jobs (`/api/cron/day-before-flights` and `/api/cron/daily-maintenance`) will run fine.
- To run the `/api/cron/email-outbox` every 5 minutes on Hobby for free:
  1. Go to [cron-job.org](https://cron-job.org) (free).
  2. Create a new cron job:
     - **URL**: `https://your-domain.vercel.app/api/cron/email-outbox`
     - **Schedule**: Every 5 minutes
     - **HTTP Headers**: Add header `Authorization: Bearer <YOUR_CRON_SECRET>`
  3. Save the job.

---

## 6. How to Test Your Endpoints

You can trigger any cron job manually anytime using `curl` or PowerShell.

### Test Locally (PowerShell):
```powershell
$headers = @{ "Authorization" = "Bearer YOUR_CRON_SECRET" }
Invoke-RestMethod -Uri "http://localhost:3000/api/cron/email-outbox" -Headers $headers
Invoke-RestMethod -Uri "http://localhost:3000/api/cron/day-before-flights" -Headers $headers
Invoke-RestMethod -Uri "http://localhost:3000/api/cron/daily-maintenance" -Headers $headers
```

### Test Locally (curl / bash):
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  http://localhost:3000/api/cron/email-outbox

curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  http://localhost:3000/api/cron/day-before-flights

curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  http://localhost:3000/api/cron/daily-maintenance
```

### Expected JSON Response:
```json
{
  "ok": true,
  "job": "day-before-flights",
  "durationMs": 142,
  "stats": {
    "tomorrowSydney": "2026-08-16",
    "scanned": 2,
    "enqueued": 2,
    "skipped": 0
  }
}
```

---

## 7. Monitoring & Troubleshooting

1. **Vercel Cron Logs**:
   In the Vercel Dashboard, go to **Logs** or **Settings > Cron Jobs**. Each invocation is logged with its duration and HTTP status code.
2. **Idempotency**:
   Every job is strictly idempotent. Running the same job multiple times will not create duplicate emails or double-expire database rows.
3. **Failures**:
   If an endpoint returns `401 Unauthorized`, verify that the `CRON_SECRET` in Vercel environment variables matches your request.
