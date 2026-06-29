"use client";

import { useState } from "react";
import Link from "next/link";

type InvoiceRef = {
  id: string;
  pdf_url: string | null;
  status: string;
};

type PackageRef = {
  name: string;
};

type Purchase = {
  id: string;
  status: "pending" | "active" | "exhausted" | "expired" | "refunded";
  hours_purchased: number;
  hours_remaining: number;
  rate_per_hour: number;
  expires_at: string;
  purchased_at: string;
  activated_at: string | null;
  package: PackageRef | PackageRef[] | null;
  invoices: InvoiceRef | InvoiceRef[] | null;
};

type BookingRef = {
  id: string;
  scheduled_start: string;
  aircraft: {
    registration: string;
  } | null;
};

type Usage = {
  id: string;
  hours_deducted: number;
  overflow_hours: number;
  overflow_amount: number;
  hours_before: number;
  hours_after: number;
  deducted_at: string;
  invoice_id: string | null;
  bookings: BookingRef | BookingRef[] | null;
  invoices: InvoiceRef | InvoiceRef[] | null;
};

type Props = {
  purchases: Purchase[];
  usage: Usage[];
};

export default function BlockTimeContent({ purchases, usage }: Props) {
  const [activeTab, setActiveTab] = useState<"usage" | "purchases">("usage");

  // Calculations
  const activePurchases = purchases.filter(
    (p) => p.status === "active" && Number(p.hours_remaining) > 0
  );
  
  const totalBalance = activePurchases.reduce(
    (sum, p) => sum + Number(p.hours_remaining),
    0
  );

  const totalPrepaidHours = purchases.reduce(
    (sum, p) => sum + (p.status !== "refunded" ? Number(p.hours_purchased) : 0),
    0
  );

  const totalDeductedHours = usage.reduce(
    (sum, u) => sum + Number(u.hours_deducted),
    0
  );

  const formatDate = (isoStr: string) => {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const getStatusBadge = (status: Purchase["status"]) => {
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        );
      case "exhausted":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            Exhausted
          </span>
        );
      case "expired":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            Expired
          </span>
        );
      case "pending":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            Pending
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-50 text-slate-600 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 font-sans pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1
            className="text-3xl font-bold text-[#152d5a] tracking-tight"
            style={{ fontFamily: "Newsreader, serif" }}
          >
            Block Time Ledger
          </h1>
          <p className="text-sm text-[#4b6390] mt-1">
            Track your prepaid block time package balances, flight deductions, and tax invoices.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#1a4fd6] hover:bg-[#153eb2] text-white text-sm font-semibold rounded-xl transition-all shadow-sm"
        >
          <span className="material-symbols-outlined text-base">add_circle</span>
          Top Up Balance
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-4 text-[#e2e8f0]">
            <span className="material-symbols-outlined text-4xl">hourglass_empty</span>
          </div>
          <div>
            <p className="text-xs font-bold text-[#4b6390] uppercase tracking-wider">Remaining Balance</p>
            <h3 className="text-3xl font-extrabold text-[#152d5a] mt-2 tabular-nums">
              {totalBalance.toFixed(1)} <span className="text-lg font-medium text-[#4b6390]">hours</span>
            </h3>
          </div>
          <p className="text-xs text-[#6b7280] mt-4 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            Across {activePurchases.length} active packages
          </p>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-4 text-[#e2e8f0]">
            <span className="material-symbols-outlined text-4xl">shopping_cart</span>
          </div>
          <div>
            <p className="text-xs font-bold text-[#4b6390] uppercase tracking-wider">Total Prepaid</p>
            <h3 className="text-3xl font-extrabold text-[#152d5a] mt-2 tabular-nums">
              {totalPrepaidHours.toFixed(1)} <span className="text-lg font-medium text-[#4b6390]">hours</span>
            </h3>
          </div>
          <p className="text-xs text-[#6b7280] mt-4">
            Pre-purchased block packages all-time
          </p>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-4 text-[#e2e8f0]">
            <span className="material-symbols-outlined text-4xl">flight_takeoff</span>
          </div>
          <div>
            <p className="text-xs font-bold text-[#4b6390] uppercase tracking-wider">Total Deducted</p>
            <h3 className="text-3xl font-extrabold text-[#152d5a] mt-2 tabular-nums">
              {totalDeductedHours.toFixed(1)} <span className="text-lg font-medium text-[#4b6390]">hours</span>
            </h3>
          </div>
          <p className="text-xs text-[#6b7280] mt-4">
            Flown and settled hours deducted
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white border border-[#e2e8f0] rounded-2xl shadow-sm overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex border-b border-[#f1f5f9] bg-[#fafbfc] px-6">
          <button
            type="button"
            onClick={() => setActiveTab("usage")}
            className={`py-4 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "usage"
                ? "border-[#1a4fd6] text-[#1a4fd6]"
                : "border-transparent text-[#64748b] hover:text-[#475569]"
            }`}
          >
            <span className="material-symbols-outlined text-lg">history</span>
            Usage Deductions
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("purchases")}
            className={`py-4 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "purchases"
                ? "border-[#1a4fd6] text-[#1a4fd6]"
                : "border-transparent text-[#64748b] hover:text-[#475569]"
            }`}
          >
            <span className="material-symbols-outlined text-lg">receipt_long</span>
            Purchase History
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-6">
          {activeTab === "usage" && (
            <div>
              {usage.length === 0 ? (
                <div className="py-12 text-center">
                  <span className="material-symbols-outlined text-4xl text-[#94a3b8] mb-3">flight</span>
                  <h4 className="font-semibold text-base text-[#152d5a]">No deductions yet</h4>
                  <p className="text-sm text-[#6b7280] mt-1 max-w-xs mx-auto">
                    When you fly, your block time deductions will be recorded here FIFO.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[#f1f5f9] text-[#64748b] font-medium">
                        <th className="pb-3 pt-1">Date Flown</th>
                        <th className="pb-3 pt-1">Aircraft</th>
                        <th className="pb-3 pt-1">Deduction</th>
                        <th className="pb-3 pt-1">Ledger Shift</th>
                        <th className="pb-3 pt-1 text-right">Tax Invoice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.map((u) => {
                        const booking = Array.isArray(u.bookings) ? u.bookings[0] : u.bookings;
                        const aircraftReg = booking?.aircraft?.registration ?? "VH-XXX";
                        const invoice = Array.isArray(u.invoices) ? u.invoices[0] : u.invoices;

                        return (
                          <tr key={u.id} className="border-b border-[#f8fafc] last:border-0 hover:bg-[#fafafa] transition-colors">
                            <td className="py-4 text-[#152d5a] font-medium">
                              {booking?.scheduled_start ? formatDate(booking.scheduled_start) : formatDate(u.deducted_at)}
                            </td>
                            <td className="py-4">
                              <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#f0f6ff] text-[#1a4fd6] border border-[#c7d8f5] text-xs font-semibold font-mono">
                                {aircraftReg}
                              </span>
                            </td>
                            <td className="py-4">
                              <span className="font-bold text-emerald-600">
                                -{Number(u.hours_deducted).toFixed(1)}h
                              </span>
                              {Number(u.overflow_hours) > 0 && (
                                <span className="block text-[11px] text-[#b45309] font-medium mt-0.5">
                                  +{Number(u.overflow_hours).toFixed(1)}h cash overflow
                                </span>
                              )}
                            </td>
                            <td className="py-4 text-xs text-[#64748b] tabular-nums font-medium">
                              {Number(u.hours_before).toFixed(1)}h → {Number(u.hours_after).toFixed(1)}h
                            </td>
                            <td className="py-4 text-right">
                              {invoice?.pdf_url ? (
                                <a
                                  href={invoice.pdf_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-[#1a4fd6] hover:text-[#153eb2] font-semibold transition-colors"
                                >
                                  <span className="material-symbols-outlined text-base">download</span>
                                  PDF
                                </a>
                              ) : (
                                <span className="text-xs text-[#94a3b8]">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "purchases" && (
            <div>
              {purchases.length === 0 ? (
                <div className="py-12 text-center">
                  <span className="material-symbols-outlined text-4xl text-[#94a3b8] mb-3">payments</span>
                  <h4 className="font-semibold text-base text-[#152d5a]">No packages purchased</h4>
                  <p className="text-sm text-[#6b7280] mt-1 max-w-xs mx-auto">
                    Buy a Block Time package to unlock locked hourly rates and simplify billing.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[#f1f5f9] text-[#64748b] font-medium">
                        <th className="pb-3 pt-1">Purchase Date</th>
                        <th className="pb-3 pt-1">Package Name</th>
                        <th className="pb-3 pt-1">Prepaid Size</th>
                        <th className="pb-3 pt-1">Rate / Pricing</th>
                        <th className="pb-3 pt-1">Status</th>
                        <th className="pb-3 pt-1 text-right">Tax Invoice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.map((p) => {
                        const pkg = Array.isArray(p.package) ? p.package[0] : p.package;
                        const invoice = Array.isArray(p.invoices) ? p.invoices[0] : p.invoices;
                        const packageName = pkg?.name ?? `Block Time (${p.hours_purchased}h)`;
                        const totalPrice = Number(p.hours_purchased) * Number(p.rate_per_hour);

                        return (
                          <tr key={p.id} className="border-b border-[#f8fafc] last:border-0 hover:bg-[#fafafa] transition-colors">
                            <td className="py-4 text-[#152d5a] font-medium">
                              {formatDate(p.purchased_at)}
                            </td>
                            <td className="py-4 text-[#152d5a] font-semibold">
                              {packageName}
                            </td>
                            <td className="py-4 text-emerald-600 font-semibold">
                              +{Number(p.hours_purchased).toFixed(1)}h
                              <span className="block text-[11px] text-[#64748b] mt-0.5 font-normal">
                                {Number(p.hours_remaining).toFixed(1)}h remaining
                              </span>
                            </td>
                            <td className="py-4 text-[#4b6390] font-medium">
                              ${Number(p.rate_per_hour).toFixed(0)}/hr
                              <span className="block text-[11px] text-[#64748b] mt-0.5 font-normal">
                                Total: ${totalPrice.toLocaleString()}
                              </span>
                            </td>
                            <td className="py-4">
                              {getStatusBadge(p.status)}
                            </td>
                            <td className="py-4 text-right">
                              {invoice?.pdf_url ? (
                                <a
                                  href={invoice.pdf_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-[#1a4fd6] hover:text-[#153eb2] font-semibold transition-colors"
                                >
                                  <span className="material-symbols-outlined text-base">download</span>
                                  PDF
                                </a>
                              ) : (
                                <span className="text-xs text-[#94a3b8]">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
