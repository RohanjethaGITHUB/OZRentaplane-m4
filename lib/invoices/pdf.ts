import 'server-only'

import { chromium } from 'playwright'

type InvoiceLineItem = {
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

type InvoicePdfInput = {
  invoiceNumber: string
  invoiceTypeLabel: string
  statusLabel: string
  createdAt: string
  dueAt?: string | null
  billingModeLabel?: string | null
  bookingRefLabel?: string | null
  billToName: string
  billToEmail: string
  billToPhone?: string | null
  lineItems: InvoiceLineItem[]
  subtotal: number
  gstAmount: number
  total: number
  footerNote: string
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
      (item) => `
        <tr>
          <td>
            <div class="desc">${escapeHtml(item.description)}</div>
          </td>
          <td class="num">${item.quantity.toFixed(Number.isInteger(item.quantity) ? 0 : 2)}</td>
          <td class="num">${formatMoney(item.unitPrice)}</td>
          <td class="num total">${formatMoney(item.amount)}</td>
        </tr>
      `,
    )
    .join('')
}

function renderInvoiceHtml(input: InvoicePdfInput): string {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(input.invoiceNumber)}</title>
      <style>
        :root {
          --navy: #152d5a;
          --blue: #1a4fd6;
          --gold: #f59e0b;
          --muted: #5b6f91;
          --line: #dbe8fb;
          --bg: #f7fbff;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 32px;
          font-family: Arial, Helvetica, sans-serif;
          color: var(--navy);
          background: white;
        }
        .page {
          border: 1px solid var(--line);
          border-top: 6px solid var(--blue);
          border-radius: 18px;
          overflow: hidden;
        }
        .top {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          padding: 28px 30px 18px;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
          border-bottom: 1px solid var(--line);
        }
        .brand {
          max-width: 52%;
        }
        .brand .eyebrow {
          color: var(--gold);
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          font-weight: 700;
          margin-bottom: 10px;
        }
        .brand h1 {
          margin: 0;
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 32px;
          line-height: 1.05;
        }
        .brand p {
          margin: 10px 0 0;
          color: var(--muted);
          line-height: 1.5;
          font-size: 13px;
        }
        .meta {
          min-width: 250px;
          text-align: right;
        }
        .meta .type {
          font-size: 12px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--blue);
          font-weight: 700;
          margin-bottom: 8px;
        }
        .meta .invoice-number {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 24px;
          margin: 0 0 8px;
        }
        .meta .status {
          display: inline-block;
          padding: 6px 10px;
          border-radius: 999px;
          background: #eef4ff;
          color: var(--blue);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .details {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 18px;
          padding: 22px 30px;
          border-bottom: 1px solid var(--line);
          background: white;
        }
        .card {
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 16px;
          background: var(--bg);
        }
        .label {
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--muted);
          font-weight: 700;
          margin-bottom: 8px;
        }
        .value {
          font-size: 15px;
          line-height: 1.5;
        }
        .table-wrap {
          padding: 0 30px 22px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
        }
        th, td {
          padding: 14px 12px;
          border-bottom: 1px solid var(--line);
          vertical-align: top;
        }
        th {
          text-align: left;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--muted);
        }
        td {
          font-size: 13px;
        }
        .desc {
          font-weight: 600;
          color: var(--navy);
        }
        .num {
          text-align: right;
          white-space: nowrap;
        }
        .total {
          font-weight: 700;
        }
        .totals {
          display: flex;
          justify-content: flex-end;
          padding: 0 30px 24px;
        }
        .totals-box {
          width: 320px;
          border: 1px solid var(--line);
          border-radius: 16px;
          background: #f8fbff;
          overflow: hidden;
        }
        .totals-row {
          display: flex;
          justify-content: space-between;
          padding: 12px 16px;
          font-size: 14px;
          border-bottom: 1px solid var(--line);
        }
        .totals-row:last-child {
          border-bottom: 0;
          font-size: 16px;
          font-weight: 700;
          background: white;
        }
        .footer {
          padding: 0 30px 28px;
          color: var(--muted);
          font-size: 12px;
          line-height: 1.6;
        }
        .footer strong {
          color: var(--navy);
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="top">
          <div class="brand">
            <div class="eyebrow">OZ Rent A Plane</div>
            <h1>Tax Invoice</h1>
            <p>Bankstown Airport, Sydney NSW<br />ABN: To be confirmed</p>
          </div>
          <div class="meta">
            <div class="type">${escapeHtml(input.invoiceTypeLabel)}</div>
            <h2 class="invoice-number">${escapeHtml(input.invoiceNumber)}</h2>
            <div class="status">${escapeHtml(input.statusLabel)}</div>
          </div>
        </div>

        <div class="details">
          <div class="card">
            <div class="label">Bill To</div>
            <div class="value">
              <strong>${escapeHtml(input.billToName)}</strong><br />
              ${escapeHtml(input.billToEmail)}<br />
              ${input.billToPhone ? escapeHtml(input.billToPhone) : ''}
            </div>
          </div>
          <div class="card">
            <div class="label">Invoice Details</div>
            <div class="value">
              Date: ${escapeHtml(formatDate(input.createdAt))}<br />
              Due: ${escapeHtml(formatDate(input.dueAt ?? input.createdAt))}<br />
              ${input.billingModeLabel ? `Billing: ${escapeHtml(input.billingModeLabel)}<br />` : ''}
              ${input.bookingRefLabel ? `${escapeHtml(input.bookingRefLabel)}<br />` : ''}
            </div>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th class="num">Qty</th>
                <th class="num">Unit</th>
                <th class="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${buildRows(input.lineItems)}
            </tbody>
          </table>
        </div>

        <div class="totals">
          <div class="totals-box">
            <div class="totals-row"><span>Subtotal</span><span>${formatMoney(input.subtotal)}</span></div>
            <div class="totals-row"><span>GST (10%)</span><span>${formatMoney(input.gstAmount)}</span></div>
            <div class="totals-row"><span>Total</span><span>${formatMoney(input.total)}</span></div>
          </div>
        </div>

        <div class="footer">
          ${escapeHtml(input.footerNote)}
        </div>
      </div>
    </body>
  </html>`
}

export async function generateInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true })
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
