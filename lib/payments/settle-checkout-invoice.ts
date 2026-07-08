import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/send-email";
import { paymentConfirmedEmail } from "@/lib/email/templates/payment";

export type ManualCheckoutPaymentMethod = "cash" | "card_in_person" | "bank_transfer";

export type ManualCheckoutPaymentInput = {
  bookingId: string;
  customerId: string;
  paymentMethod: ManualCheckoutPaymentMethod;
  amountCents: number;
  note?: string | null;
};

// Settles a checkout invoice that was paid outside Stripe (cash, card in
// person, bank transfer): writes the audit ledger row, marks the invoice paid
// via mark_checkout_invoice_paid_atomic, records status history, and notifies
// the customer. Shared by recordManualPayment (standalone settle) and
// markCheckoutOutcome (mark-paid outcome), so both paths cannot drift.
export async function settleCheckoutInvoiceManually(
  supabase: SupabaseClient<any, any, any>,
  adminId: string,
  input: ManualCheckoutPaymentInput,
): Promise<void> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("VALIDATION: Amount must be a positive whole number of cents.");
  }

  const manualRef = `manual-${input.paymentMethod}-${input.bookingId}-${Date.now()}`;
  const trimmedNote = input.note?.trim() || null;
  const methodLabel =
    input.paymentMethod === "cash"
      ? "cash"
      : input.paymentMethod === "card_in_person"
      ? "card (in person)"
      : "bank transfer";

  const { data: invoice } = await supabase
    .from("checkout_invoices")
    .select("id, checkout_outcome")
    .eq("booking_id", input.bookingId)
    .eq("invoice_type", "checkout")
    .single();

  if (!invoice) throw new Error("Checkout invoice not found.");

  const { error: ledgerError } = await supabase
    .from("customer_payment_ledger")
    .insert({
      customer_id: input.customerId,
      booking_id: input.bookingId,
      invoice_id: invoice.id,
      invoice_source_type: "checkout",
      amount_cents: input.amountCents,
      currency: "aud",
      // Keep the audit trail, but do not turn a settled checkout invoice into spendable credit.
      entry_type: "bank_transfer",
      payment_method: input.paymentMethod,
      note: trimmedNote ?? `Manual payment recorded by admin (${methodLabel}).`,
      stripe_payment_intent_id: manualRef,
      stripe_checkout_session_id: manualRef,
      created_by: adminId,
    });

  if (ledgerError) throw new Error(ledgerError.message || "Failed to record payment ledger entry.");

  const { error: rpcErr } = await supabase.rpc("mark_checkout_invoice_paid_atomic", {
    p_invoice_id: invoice.id,
    p_stripe_payment_intent_id: manualRef,
    p_stripe_checkout_session_id: manualRef,
    p_amount_paid_cents: input.amountCents,
    p_is_stripe_payment: false,
  });

  if (rpcErr) throw new Error(rpcErr.message || "Failed to settle checkout invoice.");

  await supabase
    .from("booking_status_history")
    .insert({
      booking_id: input.bookingId,
      old_status: "checkout_payment_required",
      new_status: "completed",
      note: "Checkout invoice paid via manual admin record.",
      changed_by_user_id: adminId,
    });

  let notifTitle = "Checkout payment received";
  let notifBody = "Your checkout invoice has been paid.";
  const checkoutOutcome = invoice.checkout_outcome as string | null;
  if (checkoutOutcome === "cleared_to_fly") {
    notifTitle = "Checkout payment received — you're cleared to fly";
    notifBody = "Your checkout invoice has been paid. Aircraft bookings are now available.";
  } else if (checkoutOutcome === "additional_checkout_required") {
    notifTitle = "Checkout invoice paid — additional checkout required";
    notifBody = "Your checkout invoice has been paid. An additional checkout session is required before you can be cleared to fly. You can now book another checkout flight.";
  } else if (checkoutOutcome === "checkout_reschedule_required") {
    notifTitle = "Checkout invoice paid — reschedule required";
    notifBody = "Your checkout invoice has been paid. You can now book another checkout session when you are ready.";
  } else if (checkoutOutcome === "not_currently_eligible") {
    notifTitle = "Checkout invoice paid";
    notifBody = "Your checkout invoice has been paid. Based on your assessment, further training with a qualified instructor is required before you can continue with aircraft hire.";
  }

  await supabase.from("verification_events").insert({
    user_id: input.customerId,
    actor_role: "system",
    event_type: "approved",
    title: notifTitle,
    body: notifBody,
    is_read: false,
    email_status: "skipped",
  });

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", input.customerId)
    .single();
  if (profile?.email) {
    const template = paymentConfirmedEmail(notifBody);
    await sendEmail({
      to: profile.email,
      subject: template.subject,
      html: template.html,
      eventType: "payment_confirmed",
      entityType: "checkout",
      entityId: input.bookingId,
      metadata: { checkoutOutcome: checkoutOutcome ?? null, paymentMethod: input.paymentMethod },
    });
  }
}
