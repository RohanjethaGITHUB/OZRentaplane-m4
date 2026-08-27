import { NextRequest, NextResponse } from 'next/server'
import { authorizeCronRequest } from '@/lib/jobs/authorize-cron'
import { runJob } from '@/lib/jobs/run-job'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: { job: string } },
) {
  return handleCronJob(request, params.job)
}

export async function POST(
  request: NextRequest,
  { params }: { params: { job: string } },
) {
  return handleCronJob(request, params.job)
}

async function handleCronJob(request: NextRequest, jobId: string) {
  const unauthorized = authorizeCronRequest(request)
  if (unauthorized) return unauthorized

  // Convert search params into a key-value record
  const queryParams: Record<string, string> = {}
  request.nextUrl.searchParams.forEach((val, key) => {
    queryParams[key] = val
  })

  const summary = await runJob(jobId, queryParams)
  const status = summary.ok ? 200 : summary.error === 'job_not_found' ? 404 : 500

  return NextResponse.json(summary, { status })
}
