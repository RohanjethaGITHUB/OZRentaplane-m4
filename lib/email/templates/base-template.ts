export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
}

export function renderBaseTemplate(input: {
  headline: string
  message: string
  ctaLabel: string
  ctaUrl: string
  details?: Array<{ label: string; value: string | number | null | undefined }>
}): string {
  const details = (input.details ?? [])
    .filter((item) => item.value !== null && item.value !== undefined && `${item.value}`.trim() !== '')
    .map(
      (item) =>
        `<tr><td style=\"padding:6px 0;color:#475569;font-size:14px;\"><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(String(item.value))}</td></tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang=\"en\">
  <body style=\"margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;\">
    <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"padding:24px 12px;\">
      <tr>
        <td align=\"center\">
          <table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;\">
            <tr>
              <td style=\"background:#0b1f3a;color:#ffffff;padding:20px 24px;font-size:20px;font-weight:700;\">OZ Rent A Plane</td>
            </tr>
            <tr>
              <td style=\"padding:24px;\">
                <h1 style=\"margin:0 0 12px;font-size:24px;line-height:1.3;color:#0f172a;\">${escapeHtml(input.headline)}</h1>
                <p style=\"margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;\">${escapeHtml(input.message)}</p>
                ${details ? `<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:0 0 20px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;\">${details}</table>` : ''}
                <a href=\"${escapeHtml(input.ctaUrl)}\" style=\"display:inline-block;background:#facc15;color:#111827;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:700;font-size:14px;\">${escapeHtml(input.ctaLabel)}</a>
              </td>
            </tr>
            <tr>
              <td style=\"padding:16px 24px;border-top:1px solid #e2e8f0;font-size:13px;color:#475569;\">You can reply to this email or contact us at info@ozrentaplane.com</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
