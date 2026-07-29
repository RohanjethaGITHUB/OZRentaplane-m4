import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/send-email";
import { paymentConfirmedEmail } from "@/lib/email/templates/payment";
import { generateInvoicePdf } from "@/lib/invoices/pdf";
import { storeInvoicePdf } from "@/lib/invoices/pdf-storage";
import { generateStandardBookingInvoicePdf } from "@/lib/invoices/standard-booking-pdf";
import {
  emitBlockTimeUpdated,
  emitBookingChanged,
  emitClearanceUpdated,
  emitOpsChanged,
  emitPaymentUpdated,
} from "@/lib/realtime/emit";

function logErr(step: string, err: any) {
  console.error(`[webhook] ${step}`, {
    message: err?.message,
    code: err?.code,
    details: err?.details,
    hint: err?.hint,
  });
}

function roundToCents(value: number) {
  return Math.round(value * 100) / 100;
}

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey);
}

// Event-ID level dedupe (additive to the purchase/invoice-based checks below).
// A lookup failure never blocks payment processing.
async function isEventAlreadyProcessed(supabase: any, eventId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("stripe_webhook_events")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) {
    console.warn("[webhook] event dedupe lookup failed (continuing without dedupe)", {
      message: error.message,
    });
    return false;
  }

  return Boolean(data);
}

async function markEventProcessed(supabase: any, event: Stripe.Event) {
  const { error } = await supabase
    .from("stripe_webhook_events")
    .upsert(
      { event_id: event.id, event_type: event.type },
      { onConflict: "event_id", ignoreDuplicates: true }
    );

  if (error) {
    console.warn("[webhook] failed to record processed event id (non-fatal)", {
      message: error.message,
    });
  }
}

function buildGstBreakdown(totalAmount: number) {
  const total = roundToCents(totalAmount);
  const subtotal = roundToCents(total / 1.1);
  const gstAmount = roundToCents(total - subtotal);

  return {
    subtotal,
    gstAmount,
    total,
  };
}

function getFullName(profile: { full_name?: string | null; first_name?: string | null; last_name?: string | null } | null | undefined): string {
  const fullName = profile?.full_name?.trim()
  if (fullName) return fullName
  const parts = [profile?.first_name?.trim(), profile?.last_name?.trim()].filter(Boolean)
  return parts.join(' ') || 'Pilot'
}

function getPhoneDisplay(profile: { phone_country_code?: string | null; phone_number?: string | null } | null | undefined): string | null {
  const phoneNumber = profile?.phone_number?.trim()
  if (!phoneNumber) return null
  const countryCode = profile?.phone_country_code?.trim()
  return countryCode ? `${countryCode} ${phoneNumber}` : phoneNumber
}

async function createBlockTimeInvoicePdf(params: {
  supabase: any
  invoiceId: string
  invoiceNumber: string
  userId: string
  createdAt: string
  packageName: string
  packageHours: number
  ratePerHour: number
  validityDays: number
  amountPaid: number
  subtotal: number
  gstAmount: number
  total: number
  customerProfile: {
    full_name?: string | null
    first_name?: string | null
    last_name?: string | null
    phone_country_code?: string | null
    phone_number?: string | null
    email?: string | null
  } | null
}) {
  const {
    supabase,
    invoiceId,
    invoiceNumber,
    userId,
    createdAt,
    packageName,
    packageHours,
    ratePerHour,
    validityDays,
    amountPaid,
    subtotal,
    gstAmount,
    total,
    customerProfile,
  } = params

  const purchaseDate = new Date(createdAt)
  const expiryDate = new Date(purchaseDate.getTime() + validityDays * 24 * 60 * 60 * 1000)
  const pdfBuffer = await generateInvoicePdf({
    invoiceNumber,
    documentKind: 'tax_invoice',
    statusLabel: 'PAID',
    createdAt,
    dueAt: createdAt,
    billingModeLabel: 'Block Time',
    billToName: getFullName(customerProfile),
    billToEmail: customerProfile?.email ?? '—',
    billToPhone: getPhoneDisplay(customerProfile),
    lineItems: [
      {
        description: `Block Time Package — ${packageName}`,
        quantity: packageHours,
        unitPrice: ratePerHour,
        amount: amountPaid,
      },
    ],
    subtotal,
    gstAmount,
    total,
    footerNote: `All prices include GST. Hours are valid until ${new Intl.DateTimeFormat('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(expiryDate)}. Unused hours at expiry are forfeited per Terms & Conditions.`,
  })

  return storeInvoicePdf({
    supabase,
    table: 'invoices',
    rowId: invoiceId,
    userId,
    invoiceNumber,
    pdfBuffer,
  })
}

async function createBlockTimeTopupInvoicePdf(params: {
  supabase: any
  invoiceId: string
  invoiceNumber: string
  userId: string
  createdAt: string
  packageName: string
  hoursAdded: number
  ratePerHour: number
  amountPaid: number
  subtotal: number
  gstAmount: number
  total: number
  newExpiresAt: string
  customerProfile: {
    full_name?: string | null
    first_name?: string | null
    last_name?: string | null
    phone_country_code?: string | null
    phone_number?: string | null
    email?: string | null
  } | null
}) {
  const {
    supabase,
    invoiceId,
    invoiceNumber,
    userId,
    createdAt,
    packageName,
    hoursAdded,
    ratePerHour,
    amountPaid,
    subtotal,
    gstAmount,
    total,
    newExpiresAt,
    customerProfile,
  } = params

  const pdfBuffer = await generateInvoicePdf({
    invoiceNumber,
    documentKind: 'tax_invoice',
    statusLabel: 'PAID',
    createdAt,
    dueAt: createdAt,
    billingModeLabel: 'Block Time',
    billToName: getFullName(customerProfile),
    billToEmail: customerProfile?.email ?? '—',
    billToPhone: getPhoneDisplay(customerProfile),
    lineItems: [
      {
        description: `Block Time Top-Up — ${packageName}`,
        quantity: hoursAdded,
        unitPrice: ratePerHour,
        amount: amountPaid,
      },
    ],
    subtotal,
    gstAmount,
    total,
    footerNote: `All prices include GST. Hours are valid until ${new Intl.DateTimeFormat('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(newExpiresAt))}. Unused hours at expiry are forfeited per Terms & Conditions.`,
  })

  return storeInvoicePdf({
    supabase,
    table: 'invoices',
    rowId: invoiceId,
    userId,
    invoiceNumber,
    pdfBuffer,
  })
}

export async function POST(req: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    console.error("[webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" as any });

  let body: string;
  try {
    body = await req.text();
  } catch (e: any) {
    console.error("[webhook] Failed to read request body", { error: e?.message });
    return NextResponse.json({ error: "Could not read body" }, { status: 400 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    console.error("[webhook] Missing stripe-signature header");
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error(`[webhook] Signature verification failed: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  console.log(`[webhook] Event received: type=${event.type} id=${event.id}`);

  const dedupeClient = getServiceClient();
  if (dedupeClient && (await isEventAlreadyProcessed(dedupeClient, event.id))) {
    console.log(`[webhook] Event ${event.id} already processed — skipping (dedupe)`);
    return NextResponse.json({ received: true, deduped: true });
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    console.log("[webhook] payment_intent.succeeded - payment intent details", {
      payment_intent_id: paymentIntent.id,
      amount_received: paymentIntent.amount_received,
      metadata: paymentIntent.metadata,
      purchase_id: paymentIntent.metadata?.purchase_id,
      purchase_type: paymentIntent.metadata?.purchase_type,
    });

    if (paymentIntent.metadata?.purchase_type === "block_time_topup") {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
          console.error("[webhook] Missing Supabase env vars");
          return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, serviceKey) as any;
        const purchaseId = paymentIntent.metadata.purchase_id ?? null;
        const hoursAdded = Number(paymentIntent.metadata.hours_added ?? 0);

        if (!purchaseId || !Number.isFinite(hoursAdded) || hoursAdded <= 0) {
          console.error("[webhook] block_time_topup missing purchase_id/hours_added metadata", {
            paymentIntentId: paymentIntent.id,
            purchaseId,
            hoursAdded,
          });
          // Money has been taken but the top-up cannot be applied — alert admin.
          await supabase.from("verification_events").insert({
            user_id: paymentIntent.metadata.supabase_user_id ?? null,
            actor_role: "system",
            event_type: "message",
            title: "Block time top-up payment received but not applied — manual follow-up required",
            body: `Stripe payment ${paymentIntent.id} carries purchase_type=block_time_topup but is missing usable purchase_id/hours_added metadata, so the hours were not credited. Please apply the top-up manually or refund the payment.`,
            is_read: false,
            email_status: "pending",
          });
          return NextResponse.json({ received: true });
        }

        const { data: topupRows, error: topupErr } = await supabase.rpc("apply_block_time_topup", {
          p_purchase_id: purchaseId,
          p_hours: hoursAdded,
          p_stripe_payment_intent_id: paymentIntent.id,
        });

        if (topupErr || !topupRows?.[0]) {
          logErr("apply_block_time_topup FAILED", topupErr);
          try {
            await supabase.from("verification_events").insert({
              user_id: paymentIntent.metadata.supabase_user_id ?? null,
              actor_role: "system",
              event_type: "message",
              title: "Block time top-up payment received but not applied — manual follow-up required",
              body: `Stripe payment ${paymentIntent.id} for a ${hoursAdded}h top-up of purchase ${purchaseId} could not be applied: ${topupErr?.message ?? "no result"}. Please apply the top-up manually or refund the payment.`,
              is_read: false,
              email_status: "pending",
            });
          } catch (alertErr: any) {
            console.warn("[webhook] top-up failure alert insert failed", { message: alertErr?.message });
          }
          return NextResponse.json({ error: "Payment processing failed" }, { status: 500 });
        }

        const topup = topupRows[0] as {
          out_topup_id: string;
          out_already_applied: boolean;
          out_user_id: string;
          out_package_name: string;
          out_hours_added: number;
          out_amount_paid: number;
          out_rate_per_hour: number;
          out_validity_extension_days: number;
          out_new_hours_purchased: number;
          out_new_hours_remaining: number;
          out_new_expires_at: string;
        };

        // Invoice: keyed to the payment intent so a replayed event never
        // creates a second receipt.
        const { data: existingTopupInvoice, error: existingTopupInvoiceErr } = await supabase
          .from("invoices")
          .select("id, invoice_number, pdf_url, created_at")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .eq("type", "block_time_topup")
          .maybeSingle();

        if (existingTopupInvoiceErr) {
          logErr("check existing top-up invoice FAILED", existingTopupInvoiceErr);
          return NextResponse.json({ error: "Payment processing failed" }, { status: 500 });
        }

        const amountPaid = Number(topup.out_amount_paid);
        const invoiceAmounts = buildGstBreakdown(amountPaid);
        let invoice = existingTopupInvoice as { id: string; invoice_number: string; pdf_url?: string | null; created_at?: string } | null;
        const isNewInvoice = !invoice;

        if (!invoice) {
          const { data: newInvoice, error: invoiceErr } = await supabase
            .from("invoices")
            .insert({
              type: "block_time_topup",
              user_id: topup.out_user_id,
              block_time_purchase_id: purchaseId,
              subtotal: invoiceAmounts.subtotal,
              gst_amount: invoiceAmounts.gstAmount,
              total: invoiceAmounts.total,
              status: "paid",
              payment_method: "stripe",
              stripe_payment_intent_id: paymentIntent.id,
              paid_at: new Date().toISOString(),
            })
            .select("id, invoice_number")
            .single();

          if (invoiceErr || !newInvoice) {
            logErr("insert block time top-up invoice FAILED", invoiceErr);
            return NextResponse.json({ error: "Payment processing failed" }, { status: 500 });
          }

          invoice = newInvoice;

          const { error: lineItemErr } = await supabase
            .from("invoice_line_items")
            .insert({
              invoice_id: newInvoice.id,
              type: "block_time_hours",
              description: `${topup.out_package_name} Block Time top-up`,
              quantity: Number(topup.out_hours_added),
              unit_price: Number(topup.out_rate_per_hour),
              amount: amountPaid,
              display_order: 1,
            });

          if (lineItemErr) {
            logErr("insert block time top-up line item FAILED", lineItemErr);
            return NextResponse.json({ error: "Payment processing failed" }, { status: 500 });
          }

          const { error: linkErr } = await supabase
            .from("block_time_topups")
            .update({ invoice_id: newInvoice.id })
            .eq("id", topup.out_topup_id);

          if (linkErr) {
            console.warn("[webhook] linking top-up to invoice failed (non-fatal)", { message: linkErr.message });
          }
        }

        if (!invoice) {
          // Unreachable: either the existing invoice was found or one was just
          // inserted (failures returned 500 above).
          logErr("top-up invoice unexpectedly missing", null);
          return NextResponse.json({ error: "Payment processing failed" }, { status: 500 });
        }
        const invoiceRecord = invoice;

        await markEventProcessed(supabase, event);

        if (topup.out_already_applied && !isNewInvoice) {
          console.log("[webhook] block_time_topup replay — already applied and invoiced", {
            purchaseId,
            topupId: topup.out_topup_id,
            invoiceId: invoiceRecord.id,
          });
          return NextResponse.json({ received: true });
        }

        try {
          const paymentMethodId =
            typeof paymentIntent.payment_method === "string"
              ? paymentIntent.payment_method
              : (paymentIntent.payment_method as { id?: string } | null)?.id ?? null;

          if (paymentMethodId) {
            const { error: pmUpdateErr } = await supabase
              .from("profiles")
              .update({ default_payment_method_id: paymentMethodId })
              .eq("id", topup.out_user_id);

            if (pmUpdateErr) {
              console.warn("[webhook] Failed to save default_payment_method_id (non-fatal)", {
                message: pmUpdateErr.message,
              });
            }
          }
        } catch (pmErr: any) {
          console.warn("[webhook] Failed to save default_payment_method_id (non-fatal)", {
            message: pmErr?.message,
          });
        }

        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, first_name, last_name, phone_country_code, phone_number, email")
            .eq("id", topup.out_user_id)
            .single();

          let pdfResult:
            | Awaited<ReturnType<typeof createBlockTimeTopupInvoicePdf>>
            | null = null;

          try {
            pdfResult = await createBlockTimeTopupInvoicePdf({
              supabase,
              invoiceId: invoiceRecord.id,
              invoiceNumber: invoiceRecord.invoice_number,
              userId: topup.out_user_id,
              createdAt: invoiceRecord.created_at ?? new Date().toISOString(),
              packageName: topup.out_package_name,
              hoursAdded: Number(topup.out_hours_added),
              ratePerHour: Number(topup.out_rate_per_hour),
              amountPaid,
              subtotal: invoiceAmounts.subtotal,
              gstAmount: invoiceAmounts.gstAmount,
              total: invoiceAmounts.total,
              newExpiresAt: topup.out_new_expires_at,
              customerProfile: profile ?? null,
            });
          } catch (pdfErr: any) {
            console.warn("[webhook] Top-up invoice PDF generation failed (non-fatal)", {
              message: pdfErr?.message,
            });
          }

          if (profile?.email) {
            const template = paymentConfirmedEmail(
              `Your ${topup.out_package_name} Block Time top-up is confirmed. ${Number(topup.out_hours_added).toFixed(1)} hours have been added at your locked-in rate of $${Number(topup.out_rate_per_hour).toFixed(0)}/hr — your balance is now ${Number(topup.out_new_hours_remaining).toFixed(1)} hours, valid until ${new Date(topup.out_new_expires_at).toLocaleDateString("en-AU")}.`,
              pdfResult?.pdfUrl
            );

            await sendEmail({
              to: profile.email,
              subject: template.subject,
              html: template.html,
              eventType: "block_time_topup_confirmed",
              entityType: "block_time_purchase",
              entityId: purchaseId,
              metadata: {
                invoiceId: invoiceRecord.id,
                invoiceNumber: invoiceRecord.invoice_number,
                topupId: topup.out_topup_id,
                packageName: topup.out_package_name,
                hoursAdded: Number(topup.out_hours_added),
                ratePerHour: Number(topup.out_rate_per_hour),
                pdfUrl: pdfResult?.pdfUrl ?? null,
              },
              attachments: pdfResult ? [pdfResult.attachment] : undefined,
            });
          }

          const { error: notifErr } = await supabase
            .from("verification_events")
            .insert({
              user_id: topup.out_user_id,
              actor_role: "system",
              event_type: "approved",
              title: `${topup.out_package_name} Block Time topped up`,
              body: `${Number(topup.out_hours_added).toFixed(1)} hours have been added to your package. New balance: ${Number(topup.out_new_hours_remaining).toFixed(1)} hours, valid until ${new Date(topup.out_new_expires_at).toLocaleDateString("en-AU")}.`,
              is_read: false,
              email_status: "skipped",
            });

          if (notifErr) {
            console.warn("[webhook] Top-up notification insert FAILED (non-fatal)", { message: notifErr.message });
          }
        } catch (notifEx: any) {
          console.warn("[webhook] Top-up notification failed (non-fatal)", { message: notifEx?.message });
        }

        console.log("[webhook] block_time_topup payment_intent.succeeded processed successfully ✓", {
          purchaseId,
          topupId: topup.out_topup_id,
          invoiceId: invoiceRecord.id,
          paymentIntentId: paymentIntent.id,
        });

        void emitBlockTimeUpdated(topup.out_user_id);
        void emitPaymentUpdated({ userId: topup.out_user_id, invoiceId: invoiceRecord.id });
        void emitOpsChanged();

        return NextResponse.json({ received: true });
      } catch (err: any) {
        console.error("[webhook] block_time_topup fatal error", {
          message: err?.message,
          stack: err?.stack,
          name: err?.name,
        });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }
    }

    if (paymentIntent.metadata?.purchase_type === "block_time_overage_payment") {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
          console.error("[webhook] Missing Supabase env vars");
          return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, serviceKey) as any;
        const invoiceId = paymentIntent.metadata.invoice_id ?? null;

        if (!invoiceId) {
          console.error("[webhook] block_time_overage_payment missing invoice_id metadata", {
            paymentIntentId: paymentIntent.id,
          });
          // Money has been taken but the invoice cannot be settled — alert admin.
          await supabase.from("verification_events").insert({
            user_id: paymentIntent.metadata.supabase_user_id ?? null,
            actor_role: "system",
            event_type: "message",
            title: "Block time overage payment received but not applied — manual follow-up required",
            body: `Stripe payment ${paymentIntent.id} carries purchase_type=block_time_overage_payment but is missing invoice_id metadata, so the overage invoice was not marked paid. Please settle the invoice manually or refund the payment.`,
            is_read: false,
            email_status: "pending",
          });
          return NextResponse.json({ received: true });
        }

        // Covers both overage invoices and landing fee invoices — the
        // customer-facing payment session (createBlockTimeOveragePaymentSession)
        // creates sessions for either kind of awaiting block time flight invoice.
        const { data: overageInvoice, error: overageInvoiceErr } = await supabase
          .from("invoices")
          .select("id, invoice_number, user_id, booking_id, total, status, is_block_time_overage")
          .eq("id", invoiceId)
          .eq("billing_mode", "block_time")
          .eq("type", "flight")
          .maybeSingle();

        if (overageInvoiceErr) {
          logErr("load block time invoice FAILED", overageInvoiceErr);
          return NextResponse.json({ error: "Payment processing failed" }, { status: 500 });
        }

        if (!overageInvoice) {
          console.error("[webhook] overage invoice not found", { invoiceId, paymentIntentId: paymentIntent.id });
          await supabase.from("verification_events").insert({
            user_id: paymentIntent.metadata.supabase_user_id ?? null,
            actor_role: "system",
            event_type: "message",
            title: "Block time overage payment received but invoice not found — manual follow-up required",
            body: `Stripe payment ${paymentIntent.id} references overage invoice ${invoiceId}, which does not exist. Please investigate and settle or refund manually.`,
            is_read: false,
            email_status: "pending",
          });
          return NextResponse.json({ received: true });
        }

        if (overageInvoice.status === "paid") {
          // Replay (same payment under a fresh event id) — nothing to do.
          await markEventProcessed(supabase, event);
          console.log("[webhook] block_time_overage_payment replay — invoice already paid", { invoiceId });
          return NextResponse.json({ received: true });
        }

        const { error: paidErr } = await supabase
          .from("invoices")
          .update({
            status: "paid",
            payment_method: "stripe",
            stripe_payment_intent_id: paymentIntent.id,
            paid_at: new Date().toISOString(),
          })
          .eq("id", invoiceId)
          .eq("status", "awaiting");

        if (paidErr) {
          logErr("mark overage invoice paid FAILED", paidErr);
          return NextResponse.json({ error: "Payment processing failed" }, { status: 500 });
        }

        await markEventProcessed(supabase, event);

        // Customer notification + email — the gate lifts automatically now
        // that the invoice is paid.
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", overageInvoice.user_id)
            .single();

          const isOverageInvoice = Boolean(overageInvoice.is_block_time_overage);
          const paidMessage = isOverageInvoice
            ? `Your block time overage invoice ${overageInvoice.invoice_number} ($${Number(overageInvoice.total).toFixed(2)}) has been paid. Thank you — bookings and block time purchases are available again.`
            : `Your landing fee invoice ${overageInvoice.invoice_number} ($${Number(overageInvoice.total).toFixed(2)}) has been paid. Thank you.`;

          if (profile?.email) {
            const template = paymentConfirmedEmail(paidMessage);
            await sendEmail({
              to: profile.email,
              subject: template.subject,
              html: template.html,
              eventType: isOverageInvoice ? "block_time_overage_paid" : "block_time_landing_fee_paid",
              entityType: "invoice",
              entityId: overageInvoice.id,
              metadata: {
                invoiceNumber: overageInvoice.invoice_number,
                total: Number(overageInvoice.total),
              },
            });
          }

          await supabase.from("verification_events").insert({
            user_id: overageInvoice.user_id,
            actor_role: "system",
            event_type: "approved",
            title: isOverageInvoice
              ? "Block time overage paid — account unlocked"
              : "Landing fee invoice paid",
            body: isOverageInvoice
              ? `Overage invoice ${overageInvoice.invoice_number} ($${Number(overageInvoice.total).toFixed(2)}) has been paid. New bookings, block time purchases, and top-ups are available again.`
              : `Landing fee invoice ${overageInvoice.invoice_number} ($${Number(overageInvoice.total).toFixed(2)}) has been paid.`,
            is_read: false,
            email_status: "skipped",
          });
        } catch (notifEx: any) {
          console.warn("[webhook] overage payment notification failed (non-fatal)", { message: notifEx?.message });
        }

        console.log("[webhook] block_time_overage_payment processed successfully ✓", {
          invoiceId,
          paymentIntentId: paymentIntent.id,
        });

        void emitBlockTimeUpdated(overageInvoice.user_id);
        void emitPaymentUpdated({
          userId: overageInvoice.user_id,
          bookingId: overageInvoice.booking_id ?? undefined,
          invoiceId: overageInvoice.id,
        });
        if (overageInvoice.booking_id) {
          void emitBookingChanged({ bookingId: overageInvoice.booking_id, userId: overageInvoice.user_id });
        }
        void emitOpsChanged();

        return NextResponse.json({ received: true });
      } catch (err: any) {
        console.error("[webhook] block_time_overage_payment fatal error", {
          message: err?.message,
          stack: err?.stack,
          name: err?.name,
        });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }
    }

    try {
      if (paymentIntent.metadata?.purchase_type !== "block_time") {
        console.log("[webhook] Skipping - non block_time payment intent");
        return NextResponse.json({ received: true });
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !serviceKey) {
        console.error("[webhook] Missing Supabase env vars");
        return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
      }

      const supabase = createClient(supabaseUrl, serviceKey) as any;
      const purchaseId = paymentIntent.metadata.purchase_id ?? null;

      const filters = [
        purchaseId ? `id.eq.${purchaseId}` : null,
        `stripe_payment_intent_id.eq.${paymentIntent.id}`,
      ].filter(Boolean) as string[];

      const { data: purchase, error: purchaseErr } = await supabase
        .from("pilot_block_time_purchases")
        .select(`
          id,
          user_id,
          package_id,
          hours_purchased,
          hours_remaining,
          rate_per_hour,
          amount_paid,
          status,
          expires_at,
          stripe_payment_intent_id,
          package:block_time_packages (
            id,
            name,
            hours,
            rate_per_hour,
            validity_days,
            total_price
          )
        `)
        .or(filters.join(","))
        .maybeSingle();

      if (purchaseErr) {
        logErr("load pilot_block_time_purchases FAILED", purchaseErr);
        return NextResponse.json({ error: "Payment processing failed" }, { status: 500 });
      }

      if (!purchase) {
        console.error("[webhook] No block time purchase found for payment intent", {
          paymentIntentId: paymentIntent.id,
          purchaseId,
        });
        return NextResponse.json({ received: true });
      }

      const { data: existingInvoice, error: existingInvoiceErr } = await supabase
        .from("invoices")
        .select("id, invoice_number, status, pdf_url, created_at")
        .eq("block_time_purchase_id", purchase.id)
        // Flight and top-up invoices also carry block_time_purchase_id, and
        // more than one row here would make maybeSingle() error out.
        .eq("type", "block_time_purchase")
        .maybeSingle();

      if (existingInvoiceErr) {
        logErr("check existing block time invoice FAILED", existingInvoiceErr);
        return NextResponse.json({ error: "Payment processing failed" }, { status: 500 });
      }

      const packageRow = Array.isArray(purchase.package) ? purchase.package[0] : purchase.package;
      const packageName = packageRow?.name ?? paymentIntent.metadata.package_name ?? "Block Time";
      const packageHours = Number(purchase.hours_purchased ?? paymentIntent.metadata.hours_purchased ?? 0);
      const ratePerHour = Number(purchase.rate_per_hour ?? paymentIntent.metadata.rate_per_hour ?? 0);
      const validityDays = Number(packageRow?.validity_days ?? paymentIntent.metadata.validity_days ?? 0);
      const amountPaid = Number(purchase.amount_paid ?? (paymentIntent.amount_received ?? 0) / 100);
      const invoiceAmounts = buildGstBreakdown(amountPaid);
      const activationExpiry = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString();

      if (existingInvoice) {
        const { error: updatePurchaseErr } = await supabase
          .from("pilot_block_time_purchases")
          .update({
            status: "active",
            activated_at: new Date().toISOString(),
            expires_at: activationExpiry,
            hours_remaining: packageHours,
            stripe_payment_intent_id: paymentIntent.id,
          })
          .eq("id", purchase.id);

        if (updatePurchaseErr) {
          logErr("reactivate existing block time purchase FAILED", updatePurchaseErr);
          return NextResponse.json({ error: "Payment processing failed" }, { status: 500 });
        }

        try {
          const paymentMethodId =
            typeof paymentIntent.payment_method === "string"
              ? paymentIntent.payment_method
              : (paymentIntent.payment_method as { id?: string } | null)?.id ?? null;

          if (paymentMethodId) {
            const { error: pmUpdateErr } = await supabase
              .from("profiles")
              .update({ default_payment_method_id: paymentMethodId })
              .eq("id", purchase.user_id);

            if (pmUpdateErr) {
              console.warn("[webhook] Failed to save default_payment_method_id (non-fatal)", {
                message: pmUpdateErr.message,
              });
            } else {
              console.log("[webhook] Saved default_payment_method_id for user", purchase.user_id);
            }
          }
        } catch (pmErr: any) {
          console.warn("[webhook] Failed to save default_payment_method_id (non-fatal)", {
            message: pmErr?.message,
          });
        }

        console.log("[webhook] Block time purchase already invoiced; activation refreshed", {
          purchaseId: purchase.id,
          invoiceId: existingInvoice.id,
        });

        await markEventProcessed(supabase, event);

        if (!existingInvoice.pdf_url) {
          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name, first_name, last_name, phone_country_code, phone_number, email")
              .eq("id", purchase.user_id)
              .single();

            const pdfResult = await createBlockTimeInvoicePdf({
              supabase,
              invoiceId: existingInvoice.id,
              invoiceNumber: existingInvoice.invoice_number,
              userId: purchase.user_id,
              createdAt: existingInvoice.created_at,
              packageName,
              packageHours,
              ratePerHour,
              validityDays,
              amountPaid,
              subtotal: invoiceAmounts.subtotal,
              gstAmount: invoiceAmounts.gstAmount,
              total: invoiceAmounts.total,
              customerProfile: profile ?? null,
            });

            console.log("[webhook] Existing block time invoice PDF generated", {
              invoiceId: existingInvoice.id,
              pdfUrl: pdfResult.pdfUrl,
            });
          } catch (pdfErr: any) {
            console.warn("[webhook] Existing block time invoice PDF generation failed (non-fatal)", {
              message: pdfErr?.message,
            });
          }
        }

        void emitBlockTimeUpdated(purchase.user_id);
        void emitPaymentUpdated({ userId: purchase.user_id, invoiceId: existingInvoice.id });
        void emitOpsChanged();

        return NextResponse.json({ received: true });
      }

      const invoiceDescription = `${packageName} Block Time purchase`;

      const { data: invoice, error: invoiceErr } = await supabase
        .from("invoices")
        .insert({
          type: "block_time_purchase",
          user_id: purchase.user_id,
          block_time_purchase_id: purchase.id,
          subtotal: invoiceAmounts.subtotal,
          gst_amount: invoiceAmounts.gstAmount,
          total: invoiceAmounts.total,
          status: "paid",
          payment_method: "stripe",
          stripe_payment_intent_id: paymentIntent.id,
          paid_at: new Date().toISOString(),
        })
        .select("id, invoice_number")
        .single();

      if (invoiceErr || !invoice) {
        logErr("insert block time invoice FAILED", invoiceErr);
        return NextResponse.json({ error: "Payment processing failed" }, { status: 500 });
      }

      const { error: lineItemErr } = await supabase
        .from("invoice_line_items")
        .insert({
          invoice_id: invoice.id,
          type: "block_time_hours",
          description: invoiceDescription,
          quantity: packageHours,
          unit_price: ratePerHour,
          amount: amountPaid,
          display_order: 1,
        });

      if (lineItemErr) {
        logErr("insert block time invoice line item FAILED", lineItemErr);
        return NextResponse.json({ error: "Payment processing failed" }, { status: 500 });
      }

      const { error: updatePurchaseErr } = await supabase
        .from("pilot_block_time_purchases")
        .update({
          status: "active",
          activated_at: new Date().toISOString(),
          expires_at: activationExpiry,
          hours_remaining: packageHours,
          stripe_payment_intent_id: paymentIntent.id,
        })
        .eq("id", purchase.id);

      if (updatePurchaseErr) {
        logErr("activate block time purchase FAILED", updatePurchaseErr);
        return NextResponse.json({ error: "Payment processing failed" }, { status: 500 });
      }

      await markEventProcessed(supabase, event);

      try {
        const paymentMethodId =
          typeof paymentIntent.payment_method === "string"
            ? paymentIntent.payment_method
            : (paymentIntent.payment_method as { id?: string } | null)?.id ?? null;

        if (paymentMethodId) {
          const { error: pmUpdateErr } = await supabase
            .from("profiles")
            .update({ default_payment_method_id: paymentMethodId })
            .eq("id", purchase.user_id);

          if (pmUpdateErr) {
            console.warn("[webhook] Failed to save default_payment_method_id (non-fatal)", {
              message: pmUpdateErr.message,
            });
          } else {
            console.log("[webhook] Saved default_payment_method_id for user", purchase.user_id);
          }
        }
      } catch (pmErr: any) {
        console.warn("[webhook] Failed to save default_payment_method_id (non-fatal)", {
          message: pmErr?.message,
        });
      }

      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, first_name, last_name, phone_country_code, phone_number, email")
          .eq("id", purchase.user_id)
          .single();

        let pdfResult:
          | Awaited<ReturnType<typeof createBlockTimeInvoicePdf>>
          | null = null;

        try {
          pdfResult = await createBlockTimeInvoicePdf({
            supabase,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            userId: purchase.user_id,
            createdAt: new Date().toISOString(),
            packageName,
            packageHours,
            ratePerHour,
            validityDays,
            amountPaid,
            subtotal: invoiceAmounts.subtotal,
            gstAmount: invoiceAmounts.gstAmount,
            total: invoiceAmounts.total,
            customerProfile: profile ?? null,
          });
        } catch (pdfErr: any) {
          console.warn("[webhook] Block time invoice PDF generation failed (non-fatal)", {
            message: pdfErr?.message,
          });
        }

        if (profile?.email) {
          const template = paymentConfirmedEmail(
            `${packageName} Block Time has been activated. Your ${packageHours} hour balance is now available and remains valid until ${new Date(activationExpiry).toLocaleDateString("en-AU")}.`,
            pdfResult?.pdfUrl
          );

          await sendEmail({
            to: profile.email,
            subject: template.subject,
            html: template.html,
            eventType: "block_time_purchase_confirmed",
            entityType: "block_time_purchase",
            entityId: purchase.id,
            metadata: {
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoice_number,
              packageName,
              hoursPurchased: packageHours,
              ratePerHour,
              pdfUrl: pdfResult?.pdfUrl ?? null,
            },
            attachments: pdfResult
              ? [pdfResult.attachment]
              : undefined,
          });
        }

        const { error: notifErr } = await supabase
          .from("verification_events")
          .insert({
            user_id: purchase.user_id,
            actor_role: "system",
            event_type: "approved",
            title: `${packageName} Block Time activated`,
            body: `Your ${packageHours} hour Block Time purchase has been confirmed and added to your account.`,
            is_read: false,
            email_status: "skipped",
          });

        if (notifErr) {
          console.warn("[webhook] Block time notification insert FAILED (non-fatal)", { message: notifErr.message });
        }
      } catch (notifEx: any) {
        console.warn("[webhook] Block time notification failed (non-fatal)", { message: notifEx?.message });
      }

      console.log("[webhook] block_time payment_intent.succeeded processed successfully ✓", {
        purchaseId: purchase.id,
        invoiceId: invoice.id,
        paymentIntentId: paymentIntent.id,
      });

      void emitBlockTimeUpdated(purchase.user_id);
      void emitPaymentUpdated({ userId: purchase.user_id, invoiceId: invoice.id });
      void emitOpsChanged();

      return NextResponse.json({ received: true });
    } catch (err: any) {
      console.error("[webhook] payment_intent.succeeded fatal error", {
        message: err?.message,
        stack: err?.stack,
        name: err?.name,
      });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  console.log("[webhook] checkout.session.completed - session details", {
    session_id: session.id,
    payment_intent: session.payment_intent,
    amount_total: session.amount_total,
    metadata: session.metadata,
    invoice_id: session.metadata?.invoice_id,
    booking_id: session.metadata?.booking_id,
    customer_id: session.metadata?.customer_id,
    invoice_type: session.metadata?.invoice_type,
  });

  try {
    const invoiceType = session.metadata?.invoice_type;
    if (invoiceType !== "checkout" && invoiceType !== "standard") {
      console.log(`[webhook] Skipping - unknown invoice_type: ${invoiceType}`);
      return NextResponse.json({ received: true });
    }

    const invoiceId = session.metadata?.invoice_id;
    const bookingId = session.metadata?.booking_id;
    const customerId = session.metadata?.customer_id;

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent as any)?.id ?? null;

    const amountPaid = session.amount_total ?? 0;

    console.log("[webhook] Extracted metadata", {
      invoiceId,
      bookingId,
      customerId,
      invoiceType,
      sessionId: session.id,
      paymentIntentId,
      amountPaid,
    });

    if (!invoiceId || !bookingId || !customerId) {
      console.error("[webhook] Missing required metadata - aborting", {
        invoiceId,
        bookingId,
        customerId,
      });
      return NextResponse.json({ received: true });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.error("[webhook] Missing Supabase env vars");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    if (invoiceType === "standard") {
      console.log("[webhook] Calling mark_booking_invoice_paid_atomic", { invoiceId });

      const { error: rpcErr } = await supabase.rpc("mark_booking_invoice_paid_atomic", {
        p_invoice_id: invoiceId,
        p_stripe_payment_intent_id: paymentIntentId,
        p_stripe_checkout_session_id: session.id,
        p_amount_paid_cents: amountPaid,
      });

      if (rpcErr) {
        logErr("mark_booking_invoice_paid_atomic FAILED", rpcErr);
        return NextResponse.json({ error: "Payment processing failed" }, { status: 500 });
      }

      console.log("[webhook] mark_booking_invoice_paid_atomic succeeded ✓");

      await markEventProcessed(supabase, event);

      await supabase
        .from("booking_status_history")
        .insert({
          booking_id: bookingId,
          old_status: "payment_pending",
          new_status: "completed",
          note: "Flight invoice paid via Stripe. Booking completed.",
          changed_by_user_id: null,
        })
        .then(({ error: e }) => {
          if (e) console.warn("[webhook] standard status_history insert FAILED (non-critical)", e.message);
        });

      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", customerId)
          .single();

        if (profile?.email) {
          const template = paymentConfirmedEmail("Payment has been received and recorded for your flight.");
          await sendEmail({
            to: profile.email,
            subject: template.subject,
            html: template.html,
            eventType: "post_flight_payment_received",
            entityType: "booking",
            entityId: bookingId,
          });
        }

        await supabase.from("verification_events").insert({
          user_id: customerId,
          actor_role: "system",
          event_type: "approved",
          title: "Flight payment received - booking complete",
          body: "Your flight payment has been received. Your booking is now complete.",
          is_read: false,
          email_status: "skipped",
        });

        try {
          const pdfResult = await generateStandardBookingInvoicePdf({ supabase, invoiceId })
          if (pdfResult) {
            console.log("[webhook] Standard booking receipt generated", {
              invoiceId,
              pdfUrl: pdfResult.pdfUrl,
            });
          }
        } catch (pdfErr: any) {
          console.warn("[webhook] Standard booking receipt generation failed (non-fatal)", {
            message: pdfErr?.message,
          });
        }
      } catch (notifEx: any) {
        console.warn("[webhook] Standard notification failed (non-fatal)", notifEx?.message);
      }

      console.log("[webhook] standard payment processed ✓", { invoiceId, bookingId });

      void emitPaymentUpdated({ userId: customerId, bookingId, invoiceId });
      void emitBookingChanged({ bookingId, userId: customerId });
      void emitOpsChanged();

      return NextResponse.json({ received: true });
    }

    console.log("[webhook] Calling mark_checkout_invoice_paid_atomic", {
      invoiceId,
      sessionId: session.id,
    });

    const { error: rpcErr } = await supabase.rpc("mark_checkout_invoice_paid_atomic", {
      p_invoice_id: invoiceId,
      p_stripe_payment_intent_id: paymentIntentId,
      p_stripe_checkout_session_id: session.id,
      p_amount_paid_cents: amountPaid,
      p_is_stripe_payment: true,
    });

    if (rpcErr) {
      logErr("mark_checkout_invoice_paid_atomic FAILED (returning 500 for Stripe retry)", rpcErr);
      return NextResponse.json({ error: "Payment processing failed" }, { status: 500 });
    }

    console.log("[webhook] mark_checkout_invoice_paid_atomic succeeded ✓");

    await markEventProcessed(supabase, event);

    const { error: historyErr } = await supabase.from("booking_status_history").insert({
      booking_id: bookingId,
      old_status: "checkout_payment_required",
      new_status: "completed",
      note: "Checkout invoice paid via Stripe.",
      changed_by_user_id: null,
    });

    if (historyErr) {
      console.warn("[webhook] booking_status_history insert FAILED (non-critical)", {
        message: historyErr.message,
      });
    }

    const { data: invoiceRow } = await supabase
      .from("checkout_invoices")
      .select("checkout_outcome")
      .eq("id", invoiceId)
      .single();

    const checkoutOutcome = invoiceRow?.checkout_outcome as string | null;

    let notifTitle = "Checkout payment received";
    let notifBody = "Your checkout invoice has been paid.";

    if (checkoutOutcome === "cleared_to_fly") {
      notifTitle = "Checkout payment received - you're cleared to fly";
      notifBody = "Your checkout invoice has been paid. Aircraft bookings are now available.";
    } else if (checkoutOutcome === "additional_checkout_required") {
      notifTitle = "Checkout invoice paid - additional checkout required";
      notifBody =
        "Your checkout invoice has been paid. An additional checkout session is required before you can be cleared to fly. You can now book another checkout flight.";
    } else if (checkoutOutcome === "checkout_reschedule_required") {
      notifTitle = "Checkout invoice paid - reschedule required";
      notifBody =
        "Your checkout invoice has been paid. You can now book another checkout session when you are ready.";
    } else if (checkoutOutcome === "not_currently_eligible") {
      notifTitle = "Checkout invoice paid";
      notifBody =
        "Your checkout invoice has been paid. Based on your assessment, further training with a qualified instructor is required before you can continue with aircraft hire.";
    }

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", customerId)
        .single();

      if (profile?.email) {
        const template = paymentConfirmedEmail(notifBody);
        await sendEmail({
          to: profile.email,
          subject: template.subject,
          html: template.html,
          eventType: "payment_confirmed",
          entityType: "checkout",
          entityId: bookingId,
          metadata: { checkoutOutcome: checkoutOutcome ?? null },
        });
      }

      const { error: notifErr } = await supabase.from("verification_events").insert({
        user_id: customerId,
        actor_role: "system",
        event_type: "approved",
        title: notifTitle,
        body: notifBody,
        is_read: false,
        email_status: "skipped",
      });

      if (notifErr) {
        console.warn("[webhook] Notification insert FAILED (non-fatal)", {
          message: notifErr.message,
        });
      }
    } catch (notifEx: any) {
      console.warn("[webhook] Notification threw unexpectedly (non-fatal)", {
        message: notifEx?.message,
      });
    }

    console.log("[webhook] checkout.session.completed processed successfully ✓", {
      invoiceId,
      bookingId,
      customerId,
    });

    void emitPaymentUpdated({ userId: customerId, bookingId, invoiceId });
    void emitBookingChanged({ bookingId, userId: customerId });
    void emitClearanceUpdated(customerId);
    void emitOpsChanged();

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("[webhook] checkout.session.completed fatal error", {
      message: err?.message,
      stack: err?.stack,
      name: err?.name,
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
