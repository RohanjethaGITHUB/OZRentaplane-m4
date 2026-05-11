import { createHash } from 'crypto'

type TermsRow = Record<string, unknown>

export type ActiveCheckoutTerms = {
  id: string
  version: string
  public_url: string
  content_hash: string
}

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

export function normalizeActiveCheckoutTerms(row: TermsRow | null): ActiveCheckoutTerms | null {
  if (!row) return null
  const id = str(row.id)
  const version = str(row.version || row.terms_version || row.document_version)
  const publicUrl = str(row.public_url || row.url || row.document_url)
  if (!id || !version || !publicUrl) return null

  const explicitHash = str(row.content_hash || row.terms_content_hash || row.sha256)
  const contentHash = explicitHash || createHash('sha256').update(`${id}|${version}|${publicUrl}`).digest('hex')

  return { id, version, public_url: publicUrl, content_hash: contentHash }
}
