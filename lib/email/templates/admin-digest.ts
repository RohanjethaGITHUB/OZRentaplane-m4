import { escapeHtml } from '@/lib/email/templates/base-template'
import { getAppUrl } from '@/lib/email/app-url'

const appUrl = getAppUrl()

export type WeeklyDigestFlightItem = {
  bookingId: string
  bookingReference: string
  bookingType: 'checkout' | 'standard' | string
  customerName: string
  customerEmail: string
  aircraft: string
  scheduledDate: string
  scheduledTime: string
  status: string
}

export type WeeklyDigestCustomerItem = {
  customerId: string
  customerName: string
  customerEmail: string
  customerPhone: string | null
  pilotArn: string | null
  registeredDate: string
  onboardingStatusLabel: string
  timeline: string
}

export type WeeklyOperationsDigestParams = {
  reportingPeriodLabel: string
  startDateStr: string
  endDateStr: string
  totalFlights: number
  checkoutFlightsCount: number
  rentalFlightsCount: number
  flights: WeeklyDigestFlightItem[]
  totalNewCustomers: number
  customers: WeeklyDigestCustomerItem[]
}

function getStatusBadgeStyle(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('complete') || s.includes('approved') || s.includes('cleared')) {
    return 'background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;'
  }
  if (s.includes('resched')) {
    return 'background:#f3e8ff;color:#7e22ce;border:1px solid #e9d5ff;'
  }
  if (s.includes('confirm')) {
    return 'background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;'
  }
  if (s.includes('cancel') || s.includes('reject') || s.includes('blocked')) {
    return 'background:#fee2e2;color:#b91c1c;border:1px solid #fecaca;'
  }
  if (s.includes('payment') || s.includes('invoice') || s.includes('unpaid')) {
    return 'background:#fef3c7;color:#b45309;border:1px solid #fde68a;'
  }
  if (s.includes('clarif') || s.includes('action') || s.includes('inquir') || s.includes('overdue') || s.includes('pending')) {
    return 'background:#ffedd5;color:#c2410c;border:1px solid #fed7aa;'
  }
  return 'background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;'
}

export function adminWeeklyOperationsDigestEmail(params: WeeklyOperationsDigestParams) {
  const {
    reportingPeriodLabel,
    totalFlights,
    checkoutFlightsCount,
    rentalFlightsCount,
    flights,
    totalNewCustomers,
    customers,
  } = params

  const subject = `[Weekly Operations Digest] OZ Rent A Plane — ${reportingPeriodLabel}`

  // 1. Flights Section HTML
  let flightsHtml = ''
  if (totalFlights === 0) {
    flightsHtml = `
      <div style="padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;text-align:center;color:#64748b;font-size:14px;">
        <strong>Flights: 0</strong> — No flights were scheduled or flown during this 7-day period.
      </div>
    `
  } else {
    const flightRows = flights
      .map((f) => {
        const isCheckout = f.bookingType.toLowerCase().includes('checkout')
        const typeBadge = isCheckout
          ? '<span style="display:inline-block;padding:2px 8px;font-size:11px;font-weight:700;background:#f3e8ff;color:#7e22ce;border-radius:4px;">Checkout</span>'
          : '<span style="display:inline-block;padding:2px 8px;font-size:11px;font-weight:700;background:#dbeafe;color:#1d4ed8;border-radius:4px;">Rental</span>'

        const statusStyle = getStatusBadgeStyle(f.status)
        const bookingLink = `${appUrl}/admin/bookings/requests/${f.bookingId}`

        return `
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:10px 8px;font-size:13px;">${typeBadge}</td>
            <td style="padding:10px 8px;font-size:13px;color:#334155;">
              <div>
                <a href="${bookingLink}" style="font-weight:600;color:#0284c7;text-decoration:none;">${escapeHtml(f.customerName)}</a>
              </div>
              <div style="font-size:11px;color:#64748b;">${escapeHtml(f.customerEmail)}</div>
            </td>
            <td style="padding:10px 8px;font-size:13px;color:#334155;">${escapeHtml(f.aircraft)}</td>
            <td style="padding:10px 8px;font-size:12px;color:#475569;">
              <div>${escapeHtml(f.scheduledDate)}</div>
              <div style="font-size:11px;color:#64748b;">${escapeHtml(f.scheduledTime)}</div>
            </td>
            <td style="padding:10px 8px;font-size:12px;">
              <span style="display:inline-block;padding:2px 8px;font-size:11px;font-weight:600;border-radius:4px;${statusStyle}">
                ${escapeHtml(f.status)}
              </span>
            </td>
          </tr>
        `
      })
      .join('')

    flightsHtml = `
      <div style="overflow-x:auto;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;margin-bottom:12px;">
          <thead>
            <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1;text-align:left;">
              <th style="padding:8px;font-size:12px;color:#475569;font-weight:700;">Type</th>
              <th style="padding:8px;font-size:12px;color:#475569;font-weight:700;">Customer</th>
              <th style="padding:8px;font-size:12px;color:#475569;font-weight:700;">Aircraft</th>
              <th style="padding:8px;font-size:12px;color:#475569;font-weight:700;">Schedule (Sydney)</th>
              <th style="padding:8px;font-size:12px;color:#475569;font-weight:700;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${flightRows}
          </tbody>
        </table>
      </div>
    `
  }

  // 2. Customers Section HTML
  let customersHtml = ''
  if (totalNewCustomers === 0) {
    customersHtml = `
      <div style="padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;text-align:center;color:#64748b;font-size:14px;">
        <strong>New customers: 0</strong> — No new customers registered during this 7-day period.
      </div>
    `
  } else {
    const customerCards = customers
      .map((c) => {
        const userLink = `${appUrl}/admin/users/${c.customerId}`
        const statusStyle = getStatusBadgeStyle(c.onboardingStatusLabel)

        return `
          <div style="padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
              <div>
                <a href="${userLink}" style="font-weight:700;font-size:15px;color:#0284c7;text-decoration:none;">${escapeHtml(c.customerName)}</a>
                <span style="font-size:13px;color:#64748b;margin-left:8px;">(${escapeHtml(c.customerEmail)})</span>
              </div>
              <span style="display:inline-block;padding:3px 10px;font-size:11px;font-weight:700;border-radius:4px;${statusStyle}">
                ${escapeHtml(c.onboardingStatusLabel)}
              </span>
            </div>
            <div style="font-size:12px;color:#475569;margin-bottom:8px;">
              ${c.customerPhone ? `<span>Phone: <strong>${escapeHtml(c.customerPhone)}</strong></span> &bull; ` : ''}
              ${c.pilotArn ? `<span>ARN: <strong>${escapeHtml(c.pilotArn)}</strong></span> &bull; ` : ''}
              <span>Registered: <strong>${escapeHtml(c.registeredDate)}</strong></span>
            </div>
            <div style="padding:8px 12px;background:#ffffff;border-left:3px solid #0284c7;border-radius:4px;font-size:12px;color:#334155;line-height:1.5;">
              <strong style="color:#0f172a;">Lifecycle Timeline:</strong> ${escapeHtml(c.timeline)}
            </div>
          </div>
        `
      })
      .join('')

    customersHtml = `<div>${customerCards}</div>`
  }

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
            
            <!-- Header -->
            <tr>
              <td style="background:#0b1f3a;color:#ffffff;padding:24px 28px;">
                <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#facc15;font-weight:700;margin-bottom:4px;">Operations Report</div>
                <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;color:#ffffff;">Weekly Operations Digest</h1>
                <div style="margin-top:6px;font-size:13px;color:#94a3b8;">
                  Reporting Window: <strong>${escapeHtml(reportingPeriodLabel)}</strong> (7 complete days &bull; Sydney AEST/AEDT)
                </div>
              </td>
            </tr>

            <!-- Content Area -->
            <tr>
              <td style="padding:28px;">

                <!-- Executive Summary Stat Boxes -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                  <tr>
                    <td width="25%" style="padding:4px;">
                      <div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center;">
                        <div style="font-size:24px;font-weight:700;color:#0f172a;">${totalFlights}</div>
                        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;margin-top:2px;">Total Flights</div>
                      </div>
                    </td>
                    <td width="25%" style="padding:4px;">
                      <div style="background:#f3e8ff;border:1px solid #e9d5ff;border-radius:8px;padding:12px;text-align:center;">
                        <div style="font-size:24px;font-weight:700;color:#7e22ce;">${checkoutFlightsCount}</div>
                        <div style="font-size:11px;font-weight:600;color:#7e22ce;text-transform:uppercase;margin-top:2px;">Checkouts</div>
                      </div>
                    </td>
                    <td width="25%" style="padding:4px;">
                      <div style="background:#dbeafe;border:1px solid #bfdbfe;border-radius:8px;padding:12px;text-align:center;">
                        <div style="font-size:24px;font-weight:700;color:#1d4ed8;">${rentalFlightsCount}</div>
                        <div style="font-size:11px;font-weight:600;color:#1d4ed8;text-transform:uppercase;margin-top:2px;">Rentals</div>
                      </div>
                    </td>
                    <td width="25%" style="padding:4px;">
                      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:12px;text-align:center;">
                        <div style="font-size:24px;font-weight:700;color:#047857;">${totalNewCustomers}</div>
                        <div style="font-size:11px;font-weight:600;color:#047857;text-transform:uppercase;margin-top:2px;">${totalNewCustomers === 1 ? 'New Pilot' : 'New Pilots'}</div>
                      </div>
                    </td>
                  </tr>
                </table>

                <!-- SECTION 1: FLIGHTS -->
                <div style="margin-bottom:32px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:2px solid #0f172a;padding-bottom:6px;">
                    <h2 style="margin:0;font-size:16px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.05em;">
                      1. Flights (${totalFlights})
                    </h2>
                    <span style="font-size:12px;color:#64748b;">
                      Checkout: <strong>${checkoutFlightsCount}</strong> &bull; Rental: <strong>${rentalFlightsCount}</strong>
                    </span>
                  </div>
                  ${flightsHtml}
                </div>

                <!-- SECTION 2: NEW CUSTOMERS -->
                <div style="margin-bottom:32px;">
                  <div style="margin-bottom:14px;border-bottom:2px solid #0f172a;padding-bottom:6px;">
                    <h2 style="margin:0;font-size:16px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.05em;">
                      2. New Customers &amp; Lifecycle Progress (${totalNewCustomers})
                    </h2>
                  </div>
                  ${customersHtml}
                </div>

                <!-- Admin Action Links -->
                <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e2e8f0;text-align:center;">
                  <a href="${appUrl}/admin" style="display:inline-block;background:#0b1f3a;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:700;font-size:13px;margin:4px;">
                    Admin Dashboard
                  </a>
                  <a href="${appUrl}/admin/bookings/flights" style="display:inline-block;background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:700;font-size:13px;margin:4px;">
                    View Flights Calendar
                  </a>
                  <a href="${appUrl}/admin/users" style="display:inline-block;background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:700;font-size:13px;margin:4px;">
                    Manage Pilots
                  </a>
                </div>

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center;">
                OZ Rent A Plane Automated Weekly Digest &bull; Scheduled every Friday at 6:00 AM Sydney time (AEST/AEDT).
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return {
    subject,
    html,
  }
}
