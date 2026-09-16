export type BookingTypeCard = {
  eyebrow: string
  title: string
  subtitle: string
  bullets: string[]
}

export const BOOKING_TYPE_CARDS: BookingTypeCard[] = [
  {
    eyebrow: 'PAY AS YOU FLY',
    title: 'Pay As You Fly (PAYF)',
    subtitle: 'Perfect for occasional flyers.',
    bullets: [
      'No upfront package',
      'Pay for actual flying time',
      'Best for occasional flying',
      'Same rate every hour you fly',
    ],
  },
  {
    eyebrow: 'FLEXIBLE BLOCK TIME PACKAGES',
    title: 'Prepaid Block Time Packages',
    subtitle: 'Great for regular flyers, training & hour building with flexible top-up options.',
    bullets: [
      'Discounted hourly rates (save up to $40/hr)',
      'Flexible flying across your bookings',
      'Add hours anytime to your active package',
      'Top-ups automatically extend package validity',
    ],
  },
]
