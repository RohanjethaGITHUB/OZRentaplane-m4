import 'server-only'

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
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

function getPublicAssetBase64(relativePath: string, mimeType: string): string {
  try {
    const fullPath = join(process.cwd(), 'public', relativePath)
    if (existsSync(fullPath)) {
      const buffer = readFileSync(fullPath)
      return `data:${mimeType};base64,${buffer.toString('base64')}`
    }
  } catch {
    // Graceful fallback
  }
  return ''
}

function buildRows(lineItems: InvoiceLineItem[]): string {
  return lineItems
    .map(
      (item) => `
        <tr>
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
  const isPaid = input.statusLabel.toUpperCase() === 'PAID'
  const isWaived = input.statusLabel.toUpperCase() === 'WAIVED'
  const isPending = !isPaid && !isWaived

  const documentTitle = isPaid
    ? 'TAX INVOICE / TAX RECEIPT'
    : isWaived
    ? 'TAX INVOICE (WAIVED)'
    : 'TAX INVOICE'

  const metrics = input.flightMetrics
  const hasVdo = metrics && (metrics.vdoStart != null || metrics.vdoEnd != null || metrics.vdoHours != null)
  const hasAirswitch = metrics && (metrics.airswitchStart != null || metrics.airswitchEnd != null || metrics.airswitchHours != null)
  const hasTach = metrics && !hasAirswitch && (metrics.tachStart != null || metrics.tachEnd != null || metrics.tachHours != null)
  const hasLandings = metrics?.landingsCount != null && metrics.landingsCount > 0
  const hasFlightSection = Boolean(metrics?.aircraftRegistration || hasVdo || hasAirswitch || hasTach || hasLandings)

  // Load high-resolution embedded image assets
  const topAircraftSrc = getPublicAssetBase64('CessnaImage-1.webp', 'image/webp') ||
                         getPublicAssetBase64('Cessna-fleet.jpg', 'image/jpeg') ||
                         getPublicAssetBase64('CessnaTarmac.webp', 'image/webp')

  const wingCloudSrc = getPublicAssetBase64('Login-wing.png', 'image/png') ||
                       getPublicAssetBase64('CustomerDashboard/CustomerDashboard-bookingHero.png', 'image/png') ||
                       getPublicAssetBase64('CloudLayerA.webp', 'image/webp')

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(input.invoiceNumber)}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        :root {
          --navy-dark: #0a1b38;
          --navy: #0f294a;
          --blue-primary: #1a4fd6;
          --blue-accent: #2563eb;
          --blue-light: #f0f6ff;
          --blue-card-bg: #edf5fe;
          --blue-border: #cce3f9;
          --slate-text: #4b6382;
          --slate-light: #7b8e9f;
          --table-header: #f4f8fe;
          --border-color: #e2edfa;
          --emerald: #15803d;
          --emerald-bg: #f0fdf4;
          --emerald-border: #bbf7d0;
          --amber: #b45309;
          --amber-bg: #fffbeb;
          --amber-border: #fde68a;
          --purple: #7c3aed;
          --purple-bg: #faf5ff;
          --purple-border: #ddd6fe;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
          color: var(--navy);
          background: #ffffff;
          padding: 24px 30px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .pdf-container {
          max-width: 100%;
          margin: 0 auto;
        }

        /* ── Top Header Banner ──────────────────────────────────── */
        .header-banner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: relative;
          min-height: 104px;
          padding-bottom: 12px;
          overflow: hidden;
        }
        .header-bottom-divider {
          width: 100%;
          height: 1px;
          background: var(--border-color);
          position: relative;
          z-index: 10;
          margin-bottom: 4px;
        }
        .header-left-col {
          display: flex;
          flex-direction: column;
          gap: 10px;
          z-index: 2;
          max-width: 440px;
        }
        
        /* Clean Precision Vector Typography Logo */
        .brand-logo-unit {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .brand-main-title {
          display: flex;
          align-items: baseline;
          gap: 6px;
        }
        .brand-oz-text {
          font-size: 34px;
          font-weight: 900;
          color: #0b2347;
          line-height: 0.95;
          letter-spacing: -0.03em;
        }
        .brand-rent-text {
          font-size: 24px;
          font-weight: 800;
          color: #1d4ed8;
          line-height: 1;
          letter-spacing: 0.02em;
        }
        .brand-plane-text {
          font-size: 24px;
          font-weight: 900;
          color: #0b2347;
          line-height: 1;
          letter-spacing: 0.06em;
        }
        .brand-sub-text {
          font-size: 9.5px;
          font-weight: 800;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: #0b2347;
          margin-top: 2px;
        }

        .header-meta-lines {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .meta-line {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 500;
          color: var(--slate-text);
          line-height: 1.4;
        }
        .meta-line svg {
          flex-shrink: 0;
        }

        .header-aircraft-bg {
          position: absolute;
          right: 0;
          top: 0;
          bottom: 0;
          width: 60%;
          z-index: 1;
          overflow: hidden;
          pointer-events: none;
        }
        .header-aircraft-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: right 45%;
          mask-image: linear-gradient(to right, transparent 0%, rgba(0,0,0,0.4) 15%, rgba(0,0,0,0.9) 32%, rgba(0,0,0,1) 45%);
          -webkit-mask-image: linear-gradient(to right, transparent 0%, rgba(0,0,0,0.4) 15%, rgba(0,0,0,0.9) 32%, rgba(0,0,0,1) 45%);
        }

        /* ── Title & Meta Row ────────────────────────────────────── */
        .title-meta-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 14px;
          padding-bottom: 12px;
        }
        .title-col {
          display: flex;
          flex-direction: column;
        }
        .main-invoice-title {
          font-size: 22px;
          font-weight: 800;
          color: var(--navy);
          letter-spacing: -0.02em;
          text-transform: uppercase;
        }
        .main-invoice-tagline {
          font-size: 13px;
          color: var(--slate-light);
          font-weight: 400;
          margin-top: 2px;
        }
        .meta-summary-box {
          display: flex;
          align-items: center;
          gap: 18px;
          border-left: 2px solid var(--blue-accent);
          padding-left: 14px;
        }
        .meta-text-grid {
          display: grid;
          grid-template-columns: auto auto;
          column-gap: 12px;
          row-gap: 3px;
          font-size: 11.5px;
        }
        .meta-lbl {
          font-weight: 700;
          color: var(--navy);
        }
        .meta-val {
          font-weight: 500;
          color: var(--slate-text);
        }
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 14px;
          border-radius: 999px;
          font-size: 11.5px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .status-badge.paid {
          background: #16a34a;
          color: #ffffff;
        }
        .status-badge.pending {
          background: #ea580c;
          color: #ffffff;
        }
        .status-badge.waived {
          background: #7c3aed;
          color: #ffffff;
        }

        /* ── 2-Column Info Cards ─────────────────────────────────── */
        .two-cards-grid {
          display: grid;
          grid-template-columns: 1fr 1.18fr;
          gap: 14px;
          margin-top: 4px;
        }
        .info-card {
          border: 1px solid var(--border-color);
          border-radius: 10px;
          background: #ffffff;
          padding: 12px 16px;
        }
        .card-header-title {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--navy);
          margin-bottom: 8px;
        }
        .card-content-stack {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .card-row-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--slate-text);
          line-height: 1.4;
        }
        .card-row-item.primary {
          font-weight: 700;
          color: var(--navy);
          font-size: 13px;
        }
        .booking-details-grid {
          display: grid;
          grid-template-columns: 110px 1fr;
          column-gap: 8px;
          row-gap: 4px;
          font-size: 12px;
        }
        .bkg-lbl {
          font-weight: 700;
          color: var(--navy);
        }
        .bkg-val {
          font-weight: 500;
          color: var(--slate-text);
        }

        /* ── Flight Details Banner ───────────────────────────────── */
        .flight-details-container {
          background: linear-gradient(135deg, #edf5fe 0%, #e3f0fc 100%);
          border: 1px solid var(--blue-border);
          border-radius: 12px;
          padding: 12px 16px;
          margin-top: 14px;
          position: relative;
          overflow: hidden;
        }
        .flight-details-head {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
        }
        .flight-main-lbl {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--navy);
        }
        .flight-sub-lbl {
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #4a6e99;
          margin-left: 4px;
        }
        .metrics-cards-row {
          display: flex;
          align-items: stretch;
          gap: 12px;
          max-width: calc(100% - 150px);
        }
        .metric-white-card {
          flex: 1;
          background: #ffffff;
          border: 1px solid #d4e5f7;
          border-radius: 8px;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .metric-icon-box {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 6px;
          background: #f0f7ff;
          color: var(--navy);
          flex-shrink: 0;
        }
        .metric-texts {
          display: flex;
          flex-direction: column;
        }
        .m-header {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #5b799e;
        }
        .m-main {
          font-size: 15px;
          font-weight: 800;
          color: var(--navy);
          line-height: 1.2;
          margin-top: 1px;
        }
        .m-sub {
          font-size: 9.5px;
          font-weight: 500;
          color: var(--slate-light);
          margin-top: 1px;
        }
        .flight-wing-corner {
          position: absolute;
          right: 0;
          top: 0;
          bottom: 0;
          width: 175px;
          overflow: hidden;
          clip-path: polygon(25% 0, 100% 0, 100% 100%, 0% 100%);
          -webkit-clip-path: polygon(25% 0, 100% 0, 100% 100%, 0% 100%);
        }
        .flight-wing-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
        }

        /* ── Unified Charges & Summary Card (Image 2) ───────────── */
        .unified-charges-card {
          border: 1px solid var(--border-color);
          border-radius: 12px;
          background: #ffffff;
          padding: 16px 18px 18px;
          margin-top: 14px;
        }
        .charges-header-title {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--navy);
          margin-bottom: 10px;
        }
        
        table.charges-table {
          width: 100%;
          border-collapse: collapse;
        }
        table.charges-table th {
          background: var(--table-header);
          color: #3b526d;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-align: left;
          padding: 8px 12px;
        }
        table.charges-table th:first-child {
          border-top-left-radius: 6px;
          border-bottom-left-radius: 6px;
        }
        table.charges-table th:last-child {
          border-top-right-radius: 6px;
          border-bottom-right-radius: 6px;
        }
        table.charges-table td {
          padding: 10px 12px;
          border-bottom: 1px solid #edf3fa;
          font-size: 12px;
          color: var(--navy);
          vertical-align: middle;
        }
        .item-desc .desc {
          font-weight: 600;
          color: var(--navy);
          line-height: 1.35;
        }
        .num {
          text-align: right;
          white-space: nowrap;
        }
        .num.qty {
          text-align: center;
          font-weight: 600;
          color: var(--slate-text);
        }
        .num.unit {
          color: var(--slate-text);
        }
        .num.total {
          font-weight: 700;
          color: var(--navy);
        }

        /* Charges Card Bottom Summary Row (Inside Card) */
        .charges-card-bottom {
          display: grid;
          grid-template-columns: 1fr 280px;
          gap: 20px;
          margin-top: 14px;
          align-items: center;
          padding-top: 10px;
        }
        
        /* Left: Status / Instructions Note */
        .note-status-block {
          display: flex;
          gap: 10px;
          align-items: flex-start;
        }
        .note-status-icon {
          flex-shrink: 0;
          margin-top: 1px;
        }
        .note-status-texts {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .note-status-title {
          font-size: 11.5px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .note-status-title.paid { color: var(--emerald); }
        .note-status-title.pending { color: var(--blue-primary); }
        .note-status-title.waived { color: var(--purple); }
        .note-status-body {
          font-size: 11px;
          line-height: 1.45;
          color: var(--slate-text);
        }

        /* Right: Clean Totals Grid */
        .totals-column-block {
          border-left: 1px solid var(--border-color);
          padding-left: 20px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .totals-row-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
          color: var(--slate-text);
        }
        .totals-row-item.main {
          color: var(--navy);
          font-weight: 700;
        }
        .totals-row-item.main strong {
          font-size: 17px;
          font-weight: 800;
          color: var(--navy);
        }
        .totals-row-item.due {
          color: var(--navy);
          font-weight: 700;
        }
        .totals-row-item.due strong {
          font-size: 17px;
          font-weight: 800;
          color: var(--navy);
        }
        .totals-row-item.credit {
          color: var(--purple);
          font-weight: 600;
        }
        .totals-divider {
          height: 1px;
          background: #edf3fa;
          margin: 4px 0;
        }

        /* ── Standard Clean Footer ───────────────────────────────── */
        .pdf-footer {
          margin-top: 18px;
          padding-top: 10px;
          border-top: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .footer-note-text {
          font-size: 11px;
          color: #1e293b;
          line-height: 1.45;
          font-weight: 500;
        }
        .footer-note-text strong {
          color: #0f172a;
          font-weight: 700;
        }
        .footer-law-text {
          font-size: 10px;
          color: #334155;
          line-height: 1.4;
          font-weight: 500;
        }
      </style>
    </head>
    <body>
      <div class="pdf-container">
        <!-- 1. Header Banner -->
        <header class="header-banner">
          <div class="header-left-col">
            <!-- Pure Clean Typography Logo (No aircraft or swoosh) -->
            <div class="brand-logo-unit">
              <div class="brand-main-title">
                <span class="brand-oz-text">OZ</span>
                <span class="brand-rent-text">RENT A</span>
                <span class="brand-plane-text">PLANE</span>
              </div>
              <div class="brand-sub-text">FLIGHT OPERATIONS &amp; HIRE</div>
            </div>

            <div class="header-meta-lines">
              <div class="meta-line">
                <!-- Location Pin -->
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#1e40af"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                <span>8 Wackett St, Bankstown Aerodrome NSW 2200, Australia</span>
              </div>
              <div class="meta-line">
                <!-- Tax / Building Icon -->
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#1e40af"><path d="M4 10v7h3v-7H4zm6 0v7h3v-7h-3zM2 22h19v-3H2v3zm14-12v7h3v-7h-3zm-5-7L2 6v2h19V6l-10-5z"/></svg>
                <span><strong>ABN: 76 695 639 555</strong></span>
                <span style="color: #cbd5e1;">&nbsp;|&nbsp;</span>
                <!-- Phone Icon -->
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#1e40af"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                <span>+61 474576085</span>
                <span style="color: #cbd5e1;">&nbsp;|&nbsp;</span>
                <!-- Mail Icon -->
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#1e40af"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                <span>ozrentaplane@gmail.com</span>
              </div>
            </div>
          </div>

          <!-- Seamless Aircraft Photo Fade on Right -->
          ${
            topAircraftSrc
              ? `<div class="header-aircraft-bg">
                   <img src="${topAircraftSrc}" alt="Aircraft on runway" class="header-aircraft-img" />
                 </div>`
              : ''
          }
        </header>
        <div class="header-bottom-divider"></div>

        <!-- 2. Document Title & Summary -->
        <section class="title-meta-row">
          <div class="title-col">
            <h1 class="main-invoice-title">${escapeHtml(documentTitle)}</h1>
            <p class="main-invoice-tagline">Your flight. Our passion.</p>
          </div>

          <div class="meta-summary-box">
            <div class="meta-text-grid">
              <span class="meta-lbl">Invoice No.</span>
              <span class="meta-val">${escapeHtml(input.invoiceNumber)}</span>
              <span class="meta-lbl">Issue Date</span>
              <span class="meta-val">${escapeHtml(formatDate(input.createdAt))}</span>
              <span class="meta-lbl">${isPaid ? 'Paid At' : 'Due Date'}</span>
              <span class="meta-val">${escapeHtml(formatDate(isPaid ? input.paidAt ?? input.createdAt : input.dueAt ?? input.createdAt))}</span>
            </div>

            <div class="status-badge ${isPaid ? 'paid' : isWaived ? 'waived' : 'pending'}">
              ${
                isPaid
                  ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="#ffffff"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg> PAID`
                  : isWaived
                  ? `WAIVED`
                  : `PAYMENT REQUIRED`
              }
            </div>
          </div>
        </section>

        <!-- 3. Two-Column Info Cards -->
        <section class="two-cards-grid">
          <!-- Billed To -->
          <div class="info-card">
            <div class="card-header-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#0f294a"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
              <span>BILLED TO</span>
            </div>
            <div class="card-content-stack">
              <div class="card-row-item primary">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#0f294a"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
                <span>${escapeHtml(input.billToName)}</span>
              </div>
              <div class="card-row-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#4b6382"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                <span>${escapeHtml(input.billToEmail)}</span>
              </div>
              ${
                input.billToPhone
                  ? `<div class="card-row-item">
                       <svg width="13" height="13" viewBox="0 0 24 24" fill="#4b6382"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                       <span>${escapeHtml(input.billToPhone)}</span>
                     </div>`
                  : ''
              }
            </div>
          </div>

          <!-- Invoice & Booking Details -->
          <div class="info-card">
            <div class="card-header-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#0f294a"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5z"/></svg>
              <span>INVOICE &amp; BOOKING DETAILS</span>
            </div>
            <div class="booking-details-grid">
              <span class="bkg-lbl">Booking Ref:</span>
              <span class="bkg-val">${escapeHtml(input.bookingRefLabel?.replace(/^Booking Ref:\s*/i, '') || '—')}</span>

              <span class="bkg-lbl">Flight Date:</span>
              <span class="bkg-val">${escapeHtml(input.flightDate ? formatDate(input.flightDate) : '—')}</span>

              <span class="bkg-lbl">Service:</span>
              <span class="bkg-val">${escapeHtml(input.billingModeLabel || 'Checkout Flight Assessment')}</span>

              <span class="bkg-lbl">Payment Method:</span>
              <span class="bkg-val">${escapeHtml(input.paymentMethodLabel || (isPaid ? 'Card (online)' : 'Direct Deposit / Online'))}</span>
            </div>
          </div>
        </section>

        <!-- 4. Flight Details Banner (if applicable) -->
        ${
          hasFlightSection
            ? `<section class="flight-details-container">
                 <div class="flight-details-head">
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="#0f294a"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
                   <span class="flight-main-lbl">FLIGHT DETAILS</span>
                   <span class="flight-sub-lbl">AIRCRAFT, FLIGHT &amp; METER RECORD</span>
                 </div>

                 <div class="metrics-cards-row">
                   <!-- Aircraft -->
                   <div class="metric-white-card">
                     <div class="metric-icon-box">
                       <svg width="16" height="16" viewBox="0 0 24 24" fill="#0f294a"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
                     </div>
                     <div class="metric-texts">
                       <span class="m-header">AIRCRAFT</span>
                       <span class="m-main">${escapeHtml(metrics?.aircraftRegistration || 'VH-KZG')}</span>
                       <span class="m-sub">${escapeHtml(metrics?.aircraftModel || 'Cessna 172N')}</span>
                     </div>
                   </div>

                   <!-- VDO Flight Hours -->
                   <div class="metric-white-card">
                     <div class="metric-icon-box">
                       <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0f294a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                     </div>
                     <div class="metric-texts">
                       <span class="m-header">VDO FLIGHT HOURS</span>
                       <span class="m-main">${metrics?.vdoHours != null ? `${metrics.vdoHours.toFixed(1)} hrs` : '—'}</span>
                       <span class="m-sub">${metrics?.vdoStart != null && metrics?.vdoEnd != null ? `${metrics.vdoStart.toFixed(1)} → ${metrics.vdoEnd.toFixed(1)}` : 'Recorded total'}</span>
                     </div>
                   </div>

                   <!-- Total Landings -->
                   <div class="metric-white-card">
                     <div class="metric-icon-box">
                       <svg width="17" height="17" viewBox="0 0 24 24" fill="#0f294a"><path d="M2.5 19h19v2h-19v-2zm16.84-3.15c.8.21 1.62-.26 1.84-1.06.21-.8-.26-1.62-1.06-1.84l-5.31-1.42-2.76-9.02L10.12 2l1.9 6.52-4.95-1.33-1.45-1.92-1.31-.35.48 2.67 1.44 2.84 7.91 2.12 4.7 1.3z"/></svg>
                     </div>
                     <div class="metric-texts">
                       <span class="m-header">TOTAL LANDINGS</span>
                       <span class="m-main">${metrics?.landingsCount != null ? `${metrics.landingsCount} ${metrics.landingsCount === 1 ? 'Landing' : 'Landings'}` : '—'}</span>
                       <span class="m-sub">Airport charges applied</span>
                     </div>
                   </div>
                 </div>

                 ${
                   wingCloudSrc
                     ? `<div class="flight-wing-corner">
                          <img src="${wingCloudSrc}" alt="Wing view" class="flight-wing-img" />
                        </div>`
                     : ''
                 }
               </section>`
            : ''
        }

        <!-- 5. Unified Charges & Summary Box (Image 2) -->
        <section class="unified-charges-card">
          <div class="charges-header-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#0f294a"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
            <span>CHARGES</span>
          </div>

          <table class="charges-table">
            <thead>
              <tr>
                <th>Description</th>
                <th class="num" style="text-align: center; width: 100px;">Qty / Hours</th>
                <th class="num" style="width: 120px;">Rate (AUD)</th>
                <th class="num" style="width: 130px;">Amount (AUD)</th>
              </tr>
            </thead>
            <tbody>
              ${buildRows(input.lineItems)}
            </tbody>
          </table>

          <!-- Card Bottom Summary: Status/Instruction on Left + Totals on Right -->
          <div class="charges-card-bottom">
            <!-- Left: Payment Instructions / Confirmation -->
            <div>
              ${
                isPaid
                  ? `<div class="note-status-block">
                       <div class="note-status-icon">
                         <svg width="24" height="24" viewBox="0 0 24 24" fill="#16a34a"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                       </div>
                       <div class="note-status-texts">
                         <div class="note-status-title paid">PAYMENT COMPLETED</div>
                         <p class="note-status-body">
                           This document serves as an official tax receipt confirming full settlement of all flight and landing charges.
                         </p>
                         <p class="note-status-body" style="font-weight: 700; color: #15803d; margin-top: 2px;">
                           Settled On: ${escapeHtml(formatDate(input.paidAt || input.createdAt))}
                         </p>
                       </div>
                     </div>`
                  : isWaived
                  ? `<div class="note-status-block">
                       <div class="note-status-icon">
                         <svg width="22" height="22" viewBox="0 0 24 24" fill="#7c3aed"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                       </div>
                       <div class="note-status-texts">
                         <div class="note-status-title waived">ADMINISTRATIVE WAIVER</div>
                         <p class="note-status-body">
                           This invoice has been formally waived by operations management. No payment is required.
                         </p>
                       </div>
                     </div>`
                  : `<div class="note-status-block">
                       <div class="note-status-icon">
                         <svg width="22" height="22" viewBox="0 0 24 24" fill="#1a4fd6"><path d="M4 10v7h3v-7H4zm6 0v7h3v-7h-3zM2 22h19v-3H2v3zm14-12v7h3v-7h-3zm-5-7L2 6v2h19V6l-10-5z"/></svg>
                       </div>
                       <div class="note-status-texts">
                         <div class="note-status-title pending">HOW TO PAY: DIRECT DEPOSIT (EFT)</div>
                         <p class="note-status-body">
                           <strong>Account Name:</strong> OZ Rent A Plane Pty Ltd<br />
                           <strong>BSB:</strong> 082-902 &nbsp;|&nbsp; <strong>Account:</strong> 89-123-4567<br />
                           <strong>Bank:</strong> National Australia Bank (NAB)<br />
                           <strong>Payment Reference:</strong> <strong>${escapeHtml(input.invoiceNumber)}</strong>
                         </p>
                         <p class="note-status-body" style="font-size: 10px; color: var(--slate-light); margin-top: 2px;">
                           Card payments can also be completed online via the customer billing portal.
                         </p>
                       </div>
                     </div>`
              }
            </div>

            <!-- Right: Totals Box -->
            <div class="totals-column-block">
              ${
                input.creditAppliedAmount && input.creditAppliedAmount > 0
                  ? `<div class="totals-row-item">
                       <span>Total Charges</span>
                       <span>${formatMoney(input.total)}</span>
                     </div>
                     <div class="totals-row-item credit">
                       <span>Advance Credit Applied</span>
                       <span>-${formatMoney(input.creditAppliedAmount)}</span>
                     </div>
                     <div class="totals-row-item main">
                       <span>Total (Inc. GST)</span>
                       <strong>${formatMoney(input.total - input.creditAppliedAmount)}</strong>
                     </div>`
                  : `<div class="totals-row-item main">
                       <span>Total (Inc. GST)</span>
                       <strong>${formatMoney(input.total)}</strong>
                     </div>`
              }

              <div class="totals-divider"></div>

              <div class="totals-row-item due">
                <span>${isPaid ? 'Amount Paid' : isWaived ? 'Balance Due' : 'Amount Payable'}</span>
                <strong>${formatMoney(isPaid ? (input.amountPaid ?? input.total) : isWaived ? 0 : (input.total - (input.creditAppliedAmount ?? 0)))}</strong>
              </div>
            </div>
          </div>
        </section>

        <!-- 6. Standard Clean Footer -->
        <footer class="pdf-footer">
          <p class="footer-note-text">
            <strong>Note:</strong> ${escapeHtml(input.footerNote)}
          </p>
          <p class="footer-law-text">
            Issued by OZ Rent A Plane Pty Ltd (ABN 76 695 639 555) in accordance with A New Tax System (Goods and Services Tax) Act 1999.
          </p>
        </footer>
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
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          // Linux
          '/usr/bin/google-chrome',
          '/usr/bin/chromium-browser',
          '/usr/bin/chromium',
        ]

        const foundPath = localChromeCandidates.find((candidate) => candidate && existsSync(candidate))
        if (!foundPath) {
          throw new Error('Chromium executable not found. Run `npx playwright install` or ensure Chrome/Edge is installed.')
        }

        browser = await chromium.launch({
          executablePath: foundPath,
          headless: true,
        })
      }
    }
  }

  try {
    const page = await browser.newPage()
    const html = renderInvoiceHtml(input)
    await page.setContent(html, { waitUntil: 'networkidle' })

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
    })

    return Buffer.from(pdfBuffer)
  } finally {
    await browser.close()
  }
}
