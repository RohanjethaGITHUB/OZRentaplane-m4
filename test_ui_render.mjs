const PAYF_RATE_PER_HOUR = 330;
const CHECKOUT_RATE_PER_HOUR = 290;
const bookingType = 'standard';
const activeBlockTime = { ratePerHour: 300 };

let displayBookingTypeLabel = 'Rental - PAYF';
let displayBookingRate = `$${PAYF_RATE_PER_HOUR}/h`;

if (bookingType === 'checkout') {
  displayBookingTypeLabel = 'Checkout';
  displayBookingRate = `$${CHECKOUT_RATE_PER_HOUR}/h`;
} else if (bookingType === 'standard' && activeBlockTime) {
  displayBookingTypeLabel = 'Rental - Block time';
  displayBookingRate = `$${activeBlockTime.ratePerHour}/h`;
}

console.log(`Card Label: ${displayBookingTypeLabel}`);
console.log(`Card Rate: ${displayBookingRate}`);
