import 'server-only'

import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
import chromiumMin from '@sparticuz/chromium-min'

export type InvoiceLineItem = {
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

export type FlightMeterDetails = {
  aircraftRegistration?: string | null
  aircraftModel?: string | null
  vdoStart?: number | null
  vdoEnd?: number | null
  vdoHours?: number | null
  airswitchStart?: number | null
  airswitchEnd?: number | null
  airswitchHours?: number | null
  tachStart?: number | null
  tachEnd?: number | null
  tachHours?: number | null
  landingsCount?: number | null
}

export type InvoicePdfInput = {
  invoiceNumber: string
  documentKind: 'tax_invoice' | 'receipt'
  statusLabel: string
  createdAt: string
  dueAt?: string | null
  paidAt?: string | null
  paymentMethodLabel?: string | null
  billingModeLabel?: string | null
  bookingRefLabel?: string | null
  flightDate?: string | null
  billToName: string
  billToEmail: string
  billToPhone?: string | null
  lineItems: InvoiceLineItem[]
  subtotal: number
  gstAmount: number
  total: number
  footerNote: string
  creditAppliedAmount?: number | null
  amountPaid?: number | null
  flightMetrics?: FlightMeterDetails | null
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildRows(lineItems: InvoiceLineItem[]): string {
  return lineItems
    .map(
      (item, idx) => `
        <tr class="${idx % 2 === 1 ? 'alt-row' : ''}">
          <td class="item-desc">
            <div class="desc">${escapeHtml(item.description)}</div>
          </td>
          <td class="num qty">${item.quantity.toFixed(Number.isInteger(item.quantity) ? 0 : 2)}</td>
          <td class="num unit">${formatMoney(item.unitPrice)}</td>
          <td class="num total">${formatMoney(item.amount)}</td>
        </tr>
      `,
    )
    .join('')
}

function renderInvoiceHtml(input: InvoicePdfInput): string {
  const documentTitle = input.documentKind === 'receipt' ? 'Receipt' : 'Tax Invoice'
  const documentTypeLabel = input.documentKind === 'receipt' ? 'TAX RECEIPT' : 'TAX INVOICE'
  const detailDateLabel = input.documentKind === 'receipt' ? 'Paid At' : 'Due Date'
  const isPaid = input.statusLabel.toUpperCase() === 'PAID'
  const isWaived = input.statusLabel.toUpperCase() === 'WAIVED'
  const isPending = !isPaid && !isWaived

  const metrics = input.flightMetrics
  const hasVdo = metrics && (metrics.vdoStart != null || metrics.vdoEnd != null || metrics.vdoHours != null)
  const hasAirswitch = metrics && (metrics.airswitchStart != null || metrics.airswitchEnd != null || metrics.airswitchHours != null)
  const hasTach = metrics && !hasAirswitch && (metrics.tachStart != null || metrics.tachEnd != null || metrics.tachHours != null)
  const hasFlightSection = Boolean(hasVdo || hasAirswitch || hasTach || (metrics?.landingsCount != null && metrics.landingsCount > 0))

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(input.invoiceNumber)}</title>
      <style>
        :root {
          --navy: #0e1e38;
          --navy-dark: #071224;
          --blue: #1a4fd6;
          --blue-light: #eff6ff;
          --blue-border: #bfdbfe;
          --gold: #d97706;
          --muted: #475569;
          --muted-light: #64748b;
          --line: #e2e8f0;
          --line-subtle: #f1f5f9;
          --bg-card: #f8fafc;
          --emerald: #059669;
          --purple: #7c3aed;
          --amber: #b45309;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 24px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: var(--navy);
          background: #ffffff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .page {
          border: 1px solid var(--line);
          border-top: 6px solid var(--blue);
          border-radius: 16px;
          overflow: hidden;
          background: #ffffff;
        }
        /* Top Header */
        .top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
          padding: 26px 30px 20px;
          background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
          border-bottom: 1px solid var(--line);
        }
        .brand-logo-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
        }
        .brand-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          background: var(--navy);
          color: white;
          border-radius: 10px;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: -0.05em;
        }
        .brand-name {
          font-size: 19px;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: var(--navy);
          text-transform: uppercase;
        }
        .brand-sub {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
          color: var(--blue);
          text-transform: uppercase;
        }
        .brand-info {
          margin: 10px 0 0;
          color: var(--muted);
          line-height: 1.45;
          font-size: 11.5px;
        }
        .meta {
          min-width: 260px;
          text-align: right;
        }
        .meta .type-title {
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--blue);
          font-weight: 800;
          margin-bottom: 4px;
        }
        .meta .invoice-number {
          font-size: 20px;
          font-weight: 800;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          color: var(--navy);
          margin: 0 0 8px;
          letter-spacing: -0.02em;
        }
        .meta .status {
          display: inline-block;
          padding: 5px 12px;
          border-radius: 999px;
          font-size: 10.5px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          border: 1px solid transparent;
        }
        .meta .status.paid {
          background: #ecfdf5;
          color: var(--emerald);
          border-color: #a7f3d0;
        }
        .meta .status.payment-required, .meta .status.pending {
          background: #fffbeb;
          color: var(--amber);
          border-color: #fde68a;
        }
        .meta .status.waived {
          background: #f5f3ff;
          color: var(--purple);
          border-color: #ddd6fe;
        }

        /* 2-Column Info Grid */
        .details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          padding: 20px 30px;
          border-bottom: 1px solid var(--line);
          background: white;
        }
        .card {
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 14px 16px;
          background: var(--bg-card);
        }
        .card-label {
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted-light);
          font-weight: 700;
          margin-bottom: 6px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .card-value {
          font-size: 13px;
          line-height: 1.5;
          color: var(--navy);
        }
        .card-value strong {
          font-size: 14px;
          color: var(--navy);
          font-weight: 700;
        }

        /* Flight Metrics Bar */
        .flight-metrics-wrap {
          padding: 14px 30px;
          background: linear-gradient(90deg, #f0f7ff 0%, #f8fbff 100%);
          border-bottom: 1px solid var(--blue-border);
        }
        .flight-metrics-title {
          font-size: 10.5px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--blue);
          margin-bottom: 8px;
        }
        .flight-metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 10px;
        }
        .metric-pill {
          background: white;
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 8px 12px;
        }
        .metric-label {
          font-size: 9.5px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--muted-light);
          font-weight: 700;
        }
        .metric-val {
          font-size: 12.5px;
          font-weight: 700;
          color: var(--navy);
          margin-top: 2px;
        }
        .metric-sub {
          font-size: 10px;
          color: var(--muted);
          margin-top: 1px;
        }

        /* Table */
        .table-wrap {
          padding: 16px 30px 20px;
        }
        table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          border: 1px solid var(--line);
          border-radius: 10px;
          overflow: hidden;
        }
        th {
          background: #f8fafc;
          padding: 10px 14px;
          border-bottom: 1px solid var(--line);
          text-align: left;
          font-size: 10.5px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted);
          font-weight: 700;
        }
        td {
          padding: 12px 14px;
          border-bottom: 1px solid var(--line-subtle);
          font-size: 12.5px;
          vertical-align: middle;
        }
        tr.alt-row td {
          background: #fafcff;
        }
        tr:last-child td {
          border-bottom: 0;
        }
        .item-desc .desc {
          font-weight: 600;
          color: var(--navy);
          line-height: 1.4;
        }
        .num {
          text-align: right;
          white-space: nowrap;
        }
        .num.qty {
          font-weight: 600;
          color: var(--muted);
        }
        .num.unit {
          color: var(--muted);
        }
        .num.total {
          font-weight: 700;
          color: var(--navy);
        }

        /* Totals & Payment Details Area */
        .bottom-area {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 20px;
          padding: 0 30px 24px;
          align-items: start;
        }
        .bank-details-box {
          border: 1px solid var(--blue-border);
          border-radius: 12px;
          background: #f8fbff;
          padding: 14px 16px;
        }
        .bank-title {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--blue);
          margin-bottom: 6px;
        }
        .bank-info {
          font-size: 11.5px;
          line-height: 1.5;
          color: var(--muted);
        }
        .bank-info strong {
          color: var(--navy);
        }

        .totals-box {
          border: 1px solid var(--line);
          border-radius: 12px;
          background: #f8fafc;
          overflow: hidden;
        }
        .totals-row {
          display: flex;
          justify-content: space-between;
          padding: 9px 16px;
          font-size: 12.5px;
          border-bottom: 1px solid var(--line);
          color: var(--muted);
        }
        .totals-row.subtotal-row {
          font-weight: 600;
          color: var(--navy);
        }
        .totals-row.final-total {
          border-bottom: 0;
          font-size: 15px;
          font-weight: 800;
          background: #ffffff;
          color: var(--navy);
          padding: 12px 16px;
        }
        .totals-row.credit-row {
          color: var(--purple);
          font-weight: 600;
        }
        .totals-row.paid-row {
          color: var(--emerald);
          font-weight: 600;
        }
        .totals-row.due-row {
          background: #fffbeb;
          color: var(--amber);
          font-weight: 800;
          font-size: 14px;
          border-top: 1px solid #fde68a;
        }

        /* Footer */
        .footer {
          padding: 0 30px 22px;
          color: var(--muted-light);
          font-size: 11px;
          line-height: 1.5;
          border-top: 1px solid var(--line);
          margin-top: 4px;
          padding-top: 16px;
        }
        .footer strong {
          color: var(--navy);
        }
      </style>
    </head>
    <body>
      <div class="page">
        <!-- Header -->
        <div class="top">
          <div class="brand">
            <div class="brand-logo-wrap">
              <div class="brand-badge">OZ</div>
              <div>
                <div class="brand-name">OZ Rent A Plane</div>
                <div class="brand-sub">Flight Operations &amp; Hire</div>
              </div>
            </div>
            <div class="brand-info">
              Hangar 210, Tower Road, Bankstown Airport NSW 2200<br />
              <strong>ABN: 69 679 543 198</strong> &nbsp;|&nbsp; ops@ozrentaplane.com.au
            </div>
          </div>
          <div class="meta">
            <div class="type-title">${escapeHtml(documentTypeLabel)}</div>
            <div class="invoice-number">${escapeHtml(input.invoiceNumber)}</div>
            <div class="status ${escapeHtml(input.statusLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">
              ${escapeHtml(input.statusLabel)}
            </div>
          </div>
        </div>

        <!-- Details Grid -->
        <div class="details">
          <div class="card">
            <div class="card-label">Billed To</div>
            <div class="card-value">
              <strong>${escapeHtml(input.billToName)}</strong><br />
              ${escapeHtml(input.billToEmail)}<br />
              ${input.billToPhone ? escapeHtml(input.billToPhone) : ''}
            </div>
          </div>
          <div class="card">
            <div class="card-label">Invoice &amp; Booking Details</div>
            <div class="card-value">
              <strong>Issue Date:</strong> ${escapeHtml(formatDate(input.createdAt))}<br />
              <strong>${detailDateLabel}:</strong> ${escapeHtml(formatDate(input.documentKind === 'receipt' ? input.paidAt ?? input.createdAt : input.dueAt ?? input.createdAt))}<br />
              ${input.flightDate ? `<strong>Flight Date:</strong> ${escapeHtml(formatDate(input.flightDate))}<br />` : ''}
              ${input.billingModeLabel ? `<strong>Service:</strong> ${escapeHtml(input.billingModeLabel)}<br />` : ''}
              ${input.bookingRefLabel ? `<strong>Reference:</strong> ${escapeHtml(input.bookingRefLabel)}<br />` : ''}
              ${input.documentKind === 'receipt' && input.paymentMethodLabel ? `<strong>Payment Method:</strong> ${escapeHtml(input.paymentMethodLabel)}<br />` : ''}
            </div>
          </div>
        </div>

        <!-- Optional Flight / Meter Breakdown Section -->
        ${
          hasFlightSection
            ? `
        <div class="flight-metrics-wrap">
          <div class="flight-metrics-title">Aircraft Flight &amp; Meter Record</div>
          <div class="flight-metrics-grid">
            ${
              metrics?.aircraftRegistration || metrics?.aircraftModel
                ? `
            <div class="metric-pill">
              <div class="metric-label">Aircraft</div>
              <div class="metric-val">${escapeHtml(metrics.aircraftRegistration || '')}</div>
              <div class="metric-sub">${escapeHtml(metrics.aircraftModel || 'Cessna 172')}</div>
            </div>`
                : ''
            }
            ${
              hasVdo
                ? `
            <div class="metric-pill">
              <div class="metric-label">VDO Flight Hours</div>
              <div class="metric-val">${metrics.vdoHours != null ? `${metrics.vdoHours.toFixed(1)} hrs` : '—'}</div>
              <div class="metric-sub">${metrics.vdoStart != null && metrics.vdoEnd != null ? `${metrics.vdoStart.toFixed(1)} → ${metrics.vdoEnd.toFixed(1)}` : 'Recorded total'}</div>
            </div>`
                : ''
            }
            ${
              hasAirswitch
                ? `
            <div class="metric-pill">
              <div class="metric-label">Airswitch</div>
              <div class="metric-val">${metrics.airswitchHours != null ? `${metrics.airswitchHours.toFixed(1)} hrs` : '—'}</div>
              <div class="metric-sub">${metrics.airswitchStart != null && metrics.airswitchEnd != null ? `${metrics.airswitchStart.toFixed(1)} → ${metrics.airswitchEnd.toFixed(1)}` : 'Recorded total'}</div>
            </div>`
                : hasTach
                ? `
            <div class="metric-pill">
              <div class="metric-label">Tachometer</div>
              <div class="metric-val">${metrics.tachHours != null ? `${metrics.tachHours.toFixed(1)} hrs` : '—'}</div>
              <div class="metric-sub">${metrics.tachStart != null && metrics.tachEnd != null ? `${metrics.tachStart.toFixed(1)} → ${metrics.tachEnd.toFixed(1)}` : 'Recorded total'}</div>
            </div>`
                : ''
            }
            ${
              metrics?.landingsCount != null && metrics.landingsCount > 0
                ? `
            <div class="metric-pill">
              <div class="metric-label">Total Landings</div>
              <div class="metric-val">${metrics.landingsCount} ${metrics.landingsCount === 1 ? 'Landing' : 'Landings'}</div>
              <div class="metric-sub">Airport charges applied</div>
            </div>`
                : ''
            }
          </div>
        </div>`
            : ''
        }

        <!-- Itemized Charges Table -->
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th class="num">Qty / Hours</th>
                <th class="num">Rate (AUD)</th>
                <th class="num">Amount (AUD)</th>
              </tr>
            </thead>
            <tbody>
              ${buildRows(input.lineItems)}
            </tbody>
          </table>
        </div>

        <!-- Totals & Payment Instructions -->
        <div class="bottom-area">
          <div>
            ${
              isPending
                ? `
            <div class="bank-details-box">
              <div class="bank-title">How to Pay: Direct Deposit (EFT)</div>
              <div class="bank-info">
                <strong>Account Name:</strong> OZ Rent A Plane Pty Ltd<br />
                <strong>BSB:</strong> 082-902 &nbsp;|&nbsp; <strong>Account:</strong> 89-123-4567<br />
                <strong>Bank:</strong> National Australia Bank (NAB)<br />
                <strong>Payment Reference:</strong> <strong>${escapeHtml(input.invoiceNumber)}</strong><br />
                <span style="font-size: 10.5px; color: var(--muted-light); margin-top: 4px; display: block;">
                  Card payments can also be completed online via the customer billing portal.
                </span>
              </div>
            </div>`
                : isPaid
                ? `
            <div class="bank-details-box" style="border-color: #a7f3d0; background: #f0fdf4;">
              <div class="bank-title" style="color: var(--emerald);">Payment Completed</div>
              <div class="bank-info">
                This document serves as an official tax receipt confirming full settlement of all flight and landing charges.<br />
                ${input.paidAt ? `<strong>Settled On:</strong> ${escapeHtml(formatDate(input.paidAt))}` : ''}
              </div>
            </div>`
                : isWaived
                ? `
            <div class="bank-details-box" style="border-color: #ddd6fe; background: #faf5ff;">
              <div class="bank-title" style="color: var(--purple);">Administrative Waiver</div>
              <div class="bank-info">
                This invoice has been formally waived by operations management. No payment is outstanding.
              </div>
            </div>`
                : ''
            }
          </div>

          <div class="totals-box">
            ${
              input.creditAppliedAmount && input.creditAppliedAmount > 0
                ? `<div class="totals-row subtotal-row"><span>Total Charges</span><span>${formatMoney(input.total)}</span></div>
                   <div class="totals-row credit-row"><span>Advance Credit Applied</span><span>-${formatMoney(input.creditAppliedAmount)}</span></div>
                   <div class="totals-row final-total"><span>Total (Inc. GST)</span><span>${formatMoney(input.total - input.creditAppliedAmount)}</span></div>`
                : `<div class="totals-row final-total"><span>Total (Inc. GST)</span><span>${formatMoney(input.total)}</span></div>`
            }
            ${
              isPaid
                ? `<div class="totals-row paid-row"><span>Amount Paid</span><span>${formatMoney(input.amountPaid ?? input.total)}</span></div>
                   <div class="totals-row" style="font-weight: 700; background: #f0fdf4; color: var(--emerald);"><span>Balance Due</span><span>${formatMoney(0)}</span></div>`
                : isWaived
                ? `<div class="totals-row" style="font-weight: 700; background: #faf5ff; color: var(--purple);"><span>Balance Due</span><span>${formatMoney(0)}</span></div>`
                : `<div class="totals-row due-row"><span>Amount Payable</span><span>${formatMoney(input.total - (input.creditAppliedAmount ?? 0))}</span></div>`
            }
          </div>
        </div>

        <!-- Legal ATO Footer -->
        <div class="footer">
          <div><strong>Note:</strong> ${escapeHtml(input.footerNote)}</div>
          <div style="margin-top: 4px; font-size: 10px; color: var(--muted-light);">
            Issued by OZ Rent A Plane Pty Ltd (ABN 69 679 543 198) in accordance with A New Tax System (Goods and Services Tax) Act 1999.
          </div>
        </div>
      </div>
    </body>
  </html>`
}

export async function generateInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  const isVercel = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME != null

  async function launchBrowser() {
    return chromium.launch(
      isVercel
        ? {
            args: chromiumMin.args,
            executablePath: await chromiumMin.executablePath(
              'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'
            ),
            headless: true,
          }
        : {
            headless: true,
          }
    )
  }

  let browser
  try {
    browser = await launchBrowser()
  } catch (error) {
    if (isVercel) {
      throw error
    }

    // Try channels first (Chrome or Edge)
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true })
    } catch {
      try {
        browser = await chromium.launch({ channel: 'msedge', headless: true })
      } catch {
        const localChromeCandidates = [
          // Windows
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          `${process.env.LOCALAPPDATA || ''}\\Microsoft\\Edge\\Application\\msedge.exe`,
          // macOS
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          // Linux
          '/usr/bin/google-chrome',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/snap/bin/chromium',
        ].filter(Boolean)

        const executablePath = localChromeCandidates.find((candidate) => existsSync(candidate))
        if (!executablePath) {
          throw error
        }

        browser = await chromium.launch({
          executablePath,
          headless: true,
        })
      }
    }
  }
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1800 },
      deviceScaleFactor: 1,
    })
    await page.setContent(renderInvoiceHtml(input), { waitUntil: 'networkidle' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
