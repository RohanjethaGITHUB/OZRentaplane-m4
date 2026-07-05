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
    eyebrow: 'BLOCK TIME COMBO PACKAGES',
    title: 'Prepaid Block Time Packages',
    subtitle: 'Great for regular flyers, training & hour building.',
    bullets: [
      'Discounted hourly rates',
      'Prepay and save more',
      'Perfect for training & building hours',
      'Use your hours when it suits you',
    ],
  },
]
