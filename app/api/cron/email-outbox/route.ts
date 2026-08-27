import { NextRequest, NextResponse } from 'next/server'
import { authorizeCronRequest } from '@/lib/jobs/authorize-cron'
import { runJob } from '@/lib/jobs/run-job'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  return handleOutbox(request)
}

export async function POST(request: NextRequest) {
  return handleOutbox(request)
}

async function handleOutbox(request: NextRequest) {
  const unauthorized = authorizeCronRequest(request)
  if (unauthorized) return unauthorized

  const queryParams: Record<string, string> = {}
  request.nextUrl.searchParams.forEach((val, key) => {
    queryParams[key] = val
  })

  const summary = await runJob('email-outbox', queryParams)
  const status = summary.ok ? 200 : 500

  return NextResponse.json(summary, { status })
}
