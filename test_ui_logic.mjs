const activeBlockTime = { hoursRemaining: 50 };
const vdoReading = 60;
const hourlyRateNum = 300;
const validHourlyRate = true;
const landingSubtotalCents = 2895; // 1 landing
const customerCreditCents = 0;
const billedVdoHours = null;

const finalVdoHours = billedVdoHours ?? vdoReading ?? 0
let packageDeductionHours = 0
let overageHours = 0
let overageCents = 0
let vdoBaseCents = 0

if (activeBlockTime && finalVdoHours > 0 && validHourlyRate) {
  packageDeductionHours = Math.min(finalVdoHours, activeBlockTime.hoursRemaining)
  overageHours = Math.max(finalVdoHours - activeBlockTime.hoursRemaining, 0)
  overageCents = Math.round(overageHours * Math.round(hourlyRateNum * 100))
  vdoBaseCents = overageCents
} else if (validHourlyRate && finalVdoHours > 0) {
  vdoBaseCents = Math.round(finalVdoHours * Math.round(hourlyRateNum * 100))
}

const subtotalCents      = vdoBaseCents + landingSubtotalCents
const creditApplicable   = Math.min(customerCreditCents, subtotalCents)
const estimatedAmountDue = Math.max(subtotalCents - creditApplicable, 0)

console.log({
  packageDeductionHours,
  overageHours,
  overageCents,
  vdoBaseCents,
  subtotalCents,
  estimatedAmountDue
})
