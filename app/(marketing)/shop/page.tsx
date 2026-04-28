'use client'

import { useState } from 'react'
import { FadeUp, StaggerContainer, StaggerItem, HoverEmphasize } from '@/components/MotionPresets'

// ─── Icon helper (Material Symbols Outlined) ──────────────────────────────────
function Icon({ name, className = '', style }: { name: string; className?: string; style?: React.CSSProperties }) {
  return <span className={`material-symbols-outlined ${className}`} style={style}>{name}</span>
}

// ─── Types ────────────────────────────────────────────────────────────────────
type ButtonType = 'buy' | 'enquire' | 'coming-soon'

type Product = {
  id: number
  name: string
  description: string
  price: string
  category: string
  buttonType: ButtonType
  fulfilment: string
  icon: string
  image?: string           // real photo path in /public/shop/
  imageStyle?: string      // extra Tailwind classes on the <img> (e.g. grayscale)
}

// ─── Product data ─────────────────────────────────────────────────────────────
const PRODUCTS: Product[] = [
  {
    id: 1,
    name: 'Cessna 172N Printed Checklist',
    description: 'Laminated cockpit-ready checklist for VH-KZG pilots.',
    price: '$24.95',
    category: 'Checklists & Documents',
    buttonType: 'buy',
    fulfilment: 'Pickup available',
    icon: 'checklist',
    image: '/shop/checklist.jpg',
  },
  {
    id: 2,
    name: 'OZRentAPlane Polo Shirt',
    description: 'Premium embroidered pilot-style polo.',
    price: '$49.95',
    category: 'Apparel',
    buttonType: 'coming-soon',
    fulfilment: 'Sizes coming soon',
    icon: 'checkroom',
    image: '/shop/polo.jpg',
    imageStyle: 'grayscale mix-blend-luminosity',
  },
  {
    id: 3,
    name: 'Aviation Keyring',
    description: 'Simple branded keyring for pilots and enthusiasts.',
    price: '$12.95',
    category: 'Accessories',
    buttonType: 'buy',
    fulfilment: 'Postage available',
    icon: 'key',
  },
  {
    id: 4,
    name: 'OZRentAPlane Cap',
    description: 'Clean everyday cap with subtle embroidered emblem.',
    price: '$29.95',
    category: 'Apparel',
    buttonType: 'coming-soon',
    fulfilment: 'Pickup or postage',
    icon: 'shield',
  },
  {
    id: 5,
    name: 'Aircraft Document Folder',
    description: 'Keep pilot documents, checklists, and forms organised.',
    price: '$34.95',
    category: 'Pilot Gear',
    buttonType: 'enquire',
    fulfilment: 'Pickup available',
    icon: 'folder_open',
  },
  {
    id: 6,
    name: 'Sticker Pack',
    description: 'Minimal aviation-themed OZRentAPlane sticker set.',
    price: '$9.95',
    category: 'Gifts',
    buttonType: 'buy',
    fulfilment: 'Postage available',
    icon: 'auto_awesome',
  },
]

const CATEGORIES = ['All', 'Checklists & Documents', 'Apparel', 'Accessories', 'Pilot Gear', 'Gifts']

// ─── FAQ data ─────────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    question: 'Can I pick up items when I arrive for a flight?',
    answer:
      'Yes. Selected items are available for pickup during aircraft handover. Place your order in advance and collect it when you arrive for your booking — no separate trip required.',
  },
  {
    question: 'Are the checklist documents aircraft-specific?',
    answer:
      'Yes. The printed checklists are specifically formatted for the Cessna 172N VH-KZG. They are laminated and designed for cockpit use. Ensure you download the correct version for your aircraft if ordering digitally.',
  },
  {
    question: 'Do you offer postage?',
    answer:
      'Smaller items such as keyrings and sticker packs can be posted. Postage costs are calculated based on your address at time of order. Larger items like document folders are currently available for pickup only.',
  },
  {
    question: 'Can I download the digital checklist instead?',
    answer:
      'Yes. Digital versions of checklists and reference documents are available for free in the Resources section. The printed shop versions are for pilots who prefer a laminated, cockpit-ready physical copy.',
  },
]

// ─── Product image area — real photo or styled placeholder ───────────────────
function ProductImageArea({
  icon,
  category,
  image,
  imageStyle = '',
}: {
  icon: string
  category: string
  image?: string
  imageStyle?: string
}) {
  const gradientMap: Record<string, string> = {
    'Checklists & Documents': 'from-[#071829] via-[#0b2140] to-[#071520]',
    'Apparel':                'from-[#0e1a2e] via-[#152038] to-[#0b1624]',
    'Accessories':            'from-[#091e33] via-[#0d243e] to-[#081c2e]',
    'Pilot Gear':             'from-[#071929] via-[#0b2240] to-[#071520]',
    'Gifts':                  'from-[#0b1a2f] via-[#132038] to-[#091624]',
  }
  const gradient = gradientMap[category] || 'from-[#071829] via-[#0b2140] to-[#071520]'

  if (image) {
    return (
      <div className={`w-full h-full bg-gradient-to-br ${gradient} relative overflow-hidden`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={category}
          className={`w-full h-full object-cover opacity-75 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700 ${imageStyle}`}
        />
      </div>
    )
  }

  return (
    <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center relative overflow-hidden`}>
      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle, #aec7f7 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      {/* Flight arc lines */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.06]"
        viewBox="0 0 300 180"
        preserveAspectRatio="xMidYMid slice"
      >
        <path d="M -20 140 Q 100 40 180 90 T 320 60" stroke="#aec7f7" strokeWidth="1.2" fill="none" />
        <path d="M -20 160 Q 80 60 160 110 T 320 80" stroke="#aec7f7" strokeWidth="0.6" fill="none" />
        <circle cx="180" cy="90" r="2" fill="#aec7f7" opacity="0.4" />
      </svg>
      <Icon
        name={icon}
        className="text-[#aec7f7] relative z-10"
        style={{ fontSize: '3rem', opacity: 0.25 }}
      />
    </div>
  )
}

// ─── Product card ─────────────────────────────────────────────────────────────
function ProductCard({ product }: { product: Product }) {
  return (
    <HoverEmphasize
      hoverY={-6}
      hoverScale={1.01}
      duration={0.45}
      className="group bg-[#0a1929] border border-white/[0.07] rounded-xl overflow-hidden flex flex-col h-full shadow-lg hover:border-[#aec7f7]/20 hover:shadow-2xl hover:shadow-[#aec7f7]/[0.04] transition-colors duration-500"
    >
      {/* Image area */}
      <div className="relative h-44 flex-shrink-0">
        <ProductImageArea
          icon={product.icon}
          category={product.category}
          image={product.image}
          imageStyle={product.imageStyle}
        />
        <div className="absolute top-3 left-3">
          <span className="bg-[#0d2040]/80 backdrop-blur-sm text-[#aec7f7] text-[0.62rem] font-sans font-bold uppercase tracking-wider px-3 py-1 rounded-full border border-[#aec7f7]/20">
            {product.category}
          </span>
        </div>
      </div>

      {/* Card body */}
      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-sans font-semibold text-[#d9e3f6] mb-2 leading-snug text-[0.95rem]">
          {product.name}
        </h3>
        <p className="text-[#8e9098] font-sans text-[0.8rem] leading-relaxed mb-4 flex-1">
          {product.description}
        </p>

        {/* Price */}
        <div className="mb-3">
          <span className="font-sans text-[1.6rem] font-light text-[#aec7f7] tracking-tight">
            {product.price}
          </span>
        </div>

        {/* Fulfilment note */}
        <div className="flex items-center gap-1.5 mb-4">
          <Icon
            name="local_shipping"
            className="text-[#4a5568] leading-none"
            style={{ fontSize: '0.9rem' }}
          />
          <span className="text-[#4a5568] font-sans text-[0.72rem]">{product.fulfilment}</span>
        </div>

        {/* CTA */}
        {product.buttonType === 'buy' && (
          <a
            href="#"
            className="w-full text-center bg-gradient-to-r from-[#aec7f7] to-[#1b365d] text-[#143057] rounded-md font-sans font-bold tracking-widest uppercase text-[0.68rem] px-5 py-3 shadow-lg shadow-[#aec7f7]/10 transition-all active:scale-95 hover:brightness-110"
          >
            Buy Now
          </a>
        )}
        {product.buttonType === 'enquire' && (
          <a
            href="mailto:ops@ozrentaplane.com.au?subject=Shop%20enquiry"
            className="w-full text-center border border-[#aec7f7]/35 text-[#aec7f7] rounded-md font-sans font-bold tracking-widest uppercase text-[0.68rem] px-5 py-3 hover:bg-[#aec7f7]/5 transition-colors"
          >
            Enquire
          </a>
        )}
        {product.buttonType === 'coming-soon' && (
          <button
            disabled
            className="w-full text-center border border-white/[0.08] text-[#3a4a5e] rounded-md font-sans font-bold tracking-widest uppercase text-[0.68rem] px-5 py-3 cursor-not-allowed"
          >
            Coming Soon
          </button>
        )}
      </div>
    </HoverEmphasize>
  )
}

// ─── FAQ accordion ────────────────────────────────────────────────────────────
function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-[#0c1827] rounded-lg overflow-hidden border border-white/5">
      <button
        className="w-full px-6 py-5 text-left flex justify-between items-center hover:bg-[#111e30] transition-colors"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="font-sans font-semibold text-[#d9e3f6] text-sm leading-snug pr-4">
          {question}
        </span>
        <Icon
          name={open ? 'expand_less' : 'expand_more'}
          className="text-[#aec7f7] flex-shrink-0 transition-transform duration-200"
        />
      </button>
      {open && (
        <div className="px-6 pb-5 text-[0.83rem] text-[#8e9098] leading-relaxed font-sans">
          {answer}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ShopPage() {
  const [activeCategory, setActiveCategory] = useState('All')

  const filteredProducts =
    activeCategory === 'All'
      ? PRODUCTS
      : PRODUCTS.filter((p) => p.category === activeCategory)

  return (
    <main className="bg-[#091421] text-[#d9e3f6] overflow-x-hidden">

      {/* ── 1. Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative px-6 md:px-12 lg:px-20 overflow-hidden min-h-[500px] md:min-h-[750px] flex items-center">
        {/* Background image */}
        <div
          className="absolute inset-0 z-0 bg-cover bg-center opacity-75"
          style={{ backgroundImage: 'url("/shop/hero-bg.jpg")' }}
        />
        {/* Dark navy tint — heavier left, fades right */}
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#040f1e]/70 via-[#040f1e]/30 to-transparent" />
        {/* Bottom fade into next section */}
        <div className="absolute inset-x-0 bottom-0 h-[30%] z-0 bg-gradient-to-t from-[#091421] via-[#041022]/30 to-transparent" />

        <div className="relative z-10 max-w-7xl mx-auto w-full pt-16">
          <StaggerContainer className="max-w-xl" staggerDelay={0.25}>
            <StaggerItem duration={1.4}>
              <h1 className="font-serif text-5xl md:text-7xl font-normal leading-[1.05] tracking-tight mb-6 text-white">
                Pilot Essentials &amp;<br />
                Gear
              </h1>
            </StaggerItem>
            <StaggerItem duration={1.4}>
              <p className="font-sans text-[1rem] leading-relaxed text-[#c4c6cf] mb-10 max-w-md">
                Printed checklists, cockpit-ready resources, and simple branded
                gear for pilots, students, and flying enthusiasts.
              </p>
            </StaggerItem>
          </StaggerContainer>

          <div className="flex flex-wrap items-center gap-4 mt-6">
            <FadeUp delay={1.2} duration={1.4}>
              <a
                href="#products"
                className="inline-block bg-gradient-to-r from-[#aec7f7] to-[#1b365d] text-[#143057] rounded-md font-sans font-bold tracking-widest uppercase text-[0.8rem] px-8 py-4 shadow-2xl shadow-[#aec7f7]/20 transition-all active:scale-95 hover:brightness-110"
              >
                Browse Products
              </a>
            </FadeUp>
            <FadeUp delay={1.5} duration={1.4}>
              <a
                href="/resources"
                className="font-sans font-bold text-[0.8rem] tracking-widest uppercase px-8 py-4 rounded border border-white/20 text-[#c4c6cf] hover:bg-white/5 transition-colors"
              >
                View Pilot Resources
              </a>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ── 2. Category filter row ─────────────────────────────────────────── */}
      <section id="products" className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20 pt-14 pb-8">
        <FadeUp>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`font-sans text-[0.72rem] font-semibold tracking-wider uppercase px-5 py-2 rounded-full border transition-all duration-200 ${
                  activeCategory === cat
                    ? 'bg-[#aec7f7] text-[#0a1929] border-[#aec7f7]'
                    : 'border-white/10 text-[#8e9098] hover:border-[#aec7f7]/30 hover:text-[#c4c6cf]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </FadeUp>
      </section>

      {/* ── 3. Product grid ───────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20 pb-24">
        {filteredProducts.length > 0 ? (
          <StaggerContainer
            key={activeCategory}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            staggerDelay={0.1}
          >
            {filteredProducts.map((product) => (
              <StaggerItem key={product.id} duration={1.0}>
                <ProductCard product={product} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        ) : (
          <FadeUp>
            <div className="text-center py-20 text-[#4a5568] font-sans text-sm">
              No items in this category yet. Check back soon.
            </div>
          </FadeUp>
        )}
      </section>

      {/* ── 4. Printed aircraft documents ─────────────────────────────────── */}
      <section className="py-20 px-6 md:px-12 lg:px-20">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-start">

          {/* Left: title + copy + link */}
          <FadeUp className="lg:col-span-5 space-y-8">
            <div>
              <h2 className="font-serif text-4xl md:text-5xl font-normal tracking-tight text-[#aec7f7] leading-tight mb-6">
                Printed Aircraft<br />Documents
              </h2>
              <p className="font-sans text-[#8e9098] text-[0.95rem] leading-relaxed max-w-lg">
                Some resources are available as downloadable files in the Resources
                section. Printed versions can be purchased for pilots who prefer
                cockpit-ready laminated copies.
              </p>
            </div>
            <a
              href="/resources"
              className="inline-flex items-center gap-2 text-[#aec7f7] hover:text-white transition-colors group"
            >
              <span className="font-sans text-[0.75rem] font-bold uppercase tracking-widest">
                View digital resources
              </span>
              <Icon
                name="arrow_forward"
                className="text-[#aec7f7] group-hover:translate-x-1 transition-transform"
                style={{ fontSize: '1rem' }}
              />
            </a>
          </FadeUp>

          {/* Right: image + document cards */}
          <div className="lg:col-span-7 space-y-4">

            {/* Cockpit image */}
            <FadeUp delay={0.15} duration={1.3}>
              <div className="relative h-56 md:h-72 rounded-xl overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/shop/cockpit-docs.jpg"
                  alt="Laminated checklist resting on a Cessna cockpit seat"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#091421] via-transparent to-transparent opacity-80" />
              </div>
            </FadeUp>

            {/* Document cards */}
            <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-4" staggerDelay={0.12}>

              {/* Cessna 172N Checklist — Available, red accent strip */}
              <StaggerItem duration={1.0}>
                <HoverEmphasize hoverY={-4} hoverScale={1.01} duration={0.4}
                  className="h-full"
                >
                  <div className="relative bg-[#0d1e30] rounded-xl p-6 overflow-hidden border border-white/[0.07] hover:border-[#aec7f7]/20 transition-colors duration-500 h-full"
                    style={{ background: 'linear-gradient(135deg, rgba(174,199,247,0.05) 0%, #0d1e30 100%)' }}
                  >
                    {/* Red emergency-checklist accent strip */}
                    <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-red-500/60 to-transparent rounded-t-xl" />
                    <div className="flex justify-between items-start mb-4">
                      <Icon name="menu_book" className="text-[#aec7f7]" style={{ fontSize: '1.5rem' }} />
                      <span className="bg-[#aec7f7]/10 text-[#aec7f7] text-[0.6rem] font-sans font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-[#aec7f7]/20">
                        Available
                      </span>
                    </div>
                    <h3 className="font-serif text-[1.1rem] font-normal text-[#d9e3f6] mb-1.5">
                      Cessna 172N Checklist
                    </h3>
                    <p className="font-sans text-[0.78rem] text-[#64748b]">Laminated cockpit-ready copy</p>
                  </div>
                </HoverEmphasize>
              </StaggerItem>

              {/* POH Reference Pack — Coming Soon */}
              <StaggerItem duration={1.0}>
                <HoverEmphasize hoverY={-4} hoverScale={1.01} duration={0.4}
                  className="h-full"
                >
                  <div className="relative bg-[#0d1e30] rounded-xl p-6 overflow-hidden border border-white/[0.07] hover:border-[#aec7f7]/10 transition-colors duration-500 h-full"
                    style={{ background: 'linear-gradient(135deg, rgba(174,199,247,0.05) 0%, #0d1e30 100%)' }}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <Icon name="library_books" className="text-[#608bca]" style={{ fontSize: '1.5rem' }} />
                      <span className="bg-white/[0.05] text-[#64748b] text-[0.6rem] font-sans font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-white/10">
                        Coming Soon
                      </span>
                    </div>
                    <h3 className="font-serif text-[1.1rem] font-normal text-[#d9e3f6] mb-1.5">
                      POH Reference Pack
                    </h3>
                    <p className="font-sans text-[0.78rem] text-[#64748b]">Aircraft reference pack</p>
                  </div>
                </HoverEmphasize>
              </StaggerItem>

              {/* Weight & Balance Sheet — Coming Soon, full width */}
              <StaggerItem duration={1.0} className="md:col-span-2">
                <HoverEmphasize hoverY={-4} hoverScale={1.005} duration={0.4}>
                  <div className="relative bg-[#0d1e30] rounded-xl p-6 overflow-hidden border border-white/[0.07] hover:border-[#aec7f7]/10 transition-colors duration-500"
                    style={{ background: 'linear-gradient(135deg, rgba(174,199,247,0.05) 0%, #0d1e30 100%)' }}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <Icon name="balance" className="text-[#608bca]" style={{ fontSize: '1.5rem' }} />
                      <span className="bg-white/[0.05] text-[#64748b] text-[0.6rem] font-sans font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-white/10">
                        Coming Soon
                      </span>
                    </div>
                    <h3 className="font-serif text-[1.1rem] font-normal text-[#d9e3f6] mb-1.5">
                      Weight &amp; Balance Sheet
                    </h3>
                    <p className="font-sans text-[0.78rem] text-[#64748b]">Printed planning reference</p>
                  </div>
                </HoverEmphasize>
              </StaggerItem>

            </StaggerContainer>
          </div>
        </div>
      </section>

      {/* ── 5. Pickup during handover ──────────────────────────────────────── */}
      <section className="px-6 md:px-12 lg:px-20 pb-20">
        <div className="max-w-7xl mx-auto">
          <FadeUp>
            <div className="bg-[#0a1929] rounded-xl p-8 md:p-14 relative overflow-hidden border border-white/[0.06]">

              {/* Subtle primary glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#aec7f7]/[0.04] to-transparent pointer-events-none rounded-xl" />

              {/* Header */}
              <div className="max-w-2xl mb-14 relative z-10">
                <h2 className="font-serif text-3xl md:text-4xl font-normal text-[#d9e3f6] mb-4">
                  Pickup during aircraft handover
                </h2>
                <p className="font-sans text-[#8e9098] text-[0.95rem] leading-relaxed">
                  Selected items can be collected when you arrive for your aircraft
                  booking. Smaller items can also be posted where available.
                </p>
              </div>

              {/* Timeline flow */}
              <div className="relative z-10">
                {/* Connecting line — desktop */}
                <div className="hidden md:block absolute top-6 left-6 right-6 h-px bg-white/[0.08]" />
                <div className="hidden md:block absolute top-6 left-6 w-[55%] h-px bg-gradient-to-r from-[#aec7f7]/40 to-transparent" />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-0">

                  {[
                    { icon: 'shopping_cart', label: 'Select item',        sub: 'Choose your resources', active: true  },
                    { icon: 'credit_card',   label: 'Reserve or buy',     sub: 'Secure your items',      active: true  },
                    { icon: 'flight_takeoff',label: 'Collect at handover',sub: 'Ready for your flight',  active: false },
                  ].map((step, i) => (
                    <div key={i} className="flex md:flex-col items-center md:items-start gap-4 md:gap-5 md:px-6 first:md:pl-0 last:md:pr-0">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 relative z-10 border transition-all duration-500 ${
                          step.active
                            ? 'bg-[#162a48] border-[#aec7f7]/30 shadow-[0_0_18px_rgba(174,199,247,0.15)]'
                            : 'bg-[#0d1e30] border-white/10'
                        }`}
                      >
                        <Icon
                          name={step.icon}
                          className={step.active ? 'text-[#aec7f7]' : 'text-[#4a5568]'}
                          style={{ fontSize: '1.2rem' }}
                        />
                      </div>
                      <div>
                        <h4 className="font-serif text-[1rem] font-normal text-[#d9e3f6] mb-0.5">{step.label}</h4>
                        <p className="font-sans text-[0.78rem] text-[#64748b]">{step.sub}</p>
                      </div>
                    </div>
                  ))}

                </div>
              </div>

              {/* Option chips */}
              <div className="flex flex-wrap gap-3 mt-12 relative z-10">
                <div className="bg-[#1e3450] text-[#aec7f7] px-4 py-2 rounded-full font-sans text-[0.78rem] font-semibold flex items-center gap-2">
                  <Icon name="local_mall" style={{ fontSize: '1rem' }} />
                  Pickup available
                </div>
                <div className="border border-white/10 text-[#8e9098] px-4 py-2 rounded-full font-sans text-[0.78rem] flex items-center gap-2">
                  <Icon name="local_shipping" style={{ fontSize: '1rem' }} />
                  Postage options
                </div>
                <div className="border border-white/10 text-[#8e9098] px-4 py-2 rounded-full font-sans text-[0.78rem] flex items-center gap-2">
                  <Icon name="cloud_download" style={{ fontSize: '1rem' }} />
                  Digital resources separate
                </div>
              </div>

            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── 6. Branded gear ───────────────────────────────────────────────── */}
      <section className="border-t border-white/5 py-20 px-6 md:px-12 lg:px-20">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

          {/* Left: lifestyle image */}
          <FadeUp className="order-2 lg:order-1 relative h-[460px] md:h-[500px] rounded-xl overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/shop/gear-lifestyle.jpg"
              alt="OZRentAPlane branded polo, cap, and keyring on a dark aviation surface"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#091421] via-transparent to-transparent opacity-90" />
          </FadeUp>

          {/* Right: copy + tiles */}
          <div className="order-1 lg:order-2 space-y-10">
            <StaggerContainer staggerDelay={0.2}>
              <StaggerItem duration={1.4}>
                <h2 className="font-serif text-3xl md:text-4xl font-normal text-[#d9e3f6] mb-5">
                  Simple gear for pilots<br />and supporters
                </h2>
              </StaggerItem>
              <StaggerItem duration={1.4}>
                <p className="font-sans text-[#8e9098] text-[0.95rem] leading-relaxed">
                  A small range of clean, practical OZRentAPlane gear for pilots,
                  students, and aviation supporters.
                </p>
              </StaggerItem>
            </StaggerContainer>

            <StaggerContainer className="grid grid-cols-2 gap-4" staggerDelay={0.12}>
              {[
                { icon: 'checkroom',    name: 'Polo shirt',   note: 'Coming Soon', available: false },
                { icon: 'shield',       name: 'Cap',          note: 'Coming Soon', available: false },
                { icon: 'key',          name: 'Keyring',      note: '$12.95',      available: true  },
                { icon: 'auto_awesome', name: 'Stickers',     note: '$9.95',       available: true  },
              ].map((item, i) => (
                <StaggerItem key={i} duration={1.0}>
                  <HoverEmphasize hoverY={-4} hoverScale={1.02} duration={0.4}
                    className="bg-[#0e1f33] rounded-xl p-6 hover:bg-[#122438] transition-colors duration-300 h-full"
                  >
                    <Icon
                      name={item.icon}
                      className={`mb-4 ${item.available ? 'text-[#aec7f7]' : 'text-[#3a4f68]'}`}
                      style={{ fontSize: '1.75rem' }}
                    />
                    <h4 className="font-serif text-[1rem] font-normal text-[#d9e3f6] mb-1">
                      {item.name}
                    </h4>
                    <span className={`font-sans text-[0.72rem] ${item.available ? 'text-[#aec7f7]' : 'text-[#4a5568]'}`}>
                      {item.note}
                    </span>
                  </HoverEmphasize>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>

        </div>
      </section>

      {/* ── 7. More items coming soon ─────────────────────────────────────── */}
      <section className="py-6 px-6 md:px-12 lg:px-20 pb-20">
        <div className="max-w-7xl mx-auto">
          <FadeUp>
            <div className="bg-[#0a1929] rounded-xl border border-white/[0.06] overflow-hidden relative">

              {/* Flight-plan dashed vertical lines in background */}
              <div
                className="absolute inset-0 opacity-[0.07] pointer-events-none"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(174,199,247,0.6) 40px, rgba(174,199,247,0.6) 41px)',
                }}
              />
              {/* Left glow */}
              <div className="absolute top-0 left-0 w-1/3 h-full bg-gradient-to-r from-[#aec7f7]/[0.04] to-transparent pointer-events-none" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 p-8 md:p-12 relative z-10">

                {/* Left */}
                <div className="space-y-6">
                  <h2 className="font-serif text-3xl font-normal text-[#aec7f7]">
                    More items coming soon
                  </h2>
                  <p className="font-sans text-[#8e9098] text-[0.9rem] leading-relaxed">
                    We are starting with practical pilot resources and a small range
                    of branded gear. More cockpit tools, apparel, and aviation
                    accessories will be added over time.
                  </p>
                  <a
                    href="mailto:ops@ozrentaplane.com.au?subject=Shop%20item%20suggestion"
                    className="inline-block bg-gradient-to-r from-[#aec7f7] to-[#1b365d] text-[#143057] rounded-full font-sans font-bold tracking-widest uppercase text-[0.72rem] px-6 py-3 shadow-lg shadow-[#aec7f7]/10 transition-all active:scale-95 hover:brightness-110"
                  >
                    Suggest an item
                  </a>
                </div>

                {/* Right: future items list */}
                <div className="flex flex-col justify-center">
                  <ul className="space-y-0 divide-y divide-white/[0.05]">
                    {[
                      { icon: 'build',      label: 'Cockpit tools'     },
                      { icon: 'checkroom',  label: 'Branded apparel'   },
                      { icon: 'headphones', label: 'Aircraft accessories' },
                      { icon: 'redeem',     label: 'Gift items'        },
                    ].map((item, i) => (
                      <li key={i} className="flex items-center gap-4 text-[#d9e3f6] py-4">
                        <Icon name={item.icon} className="text-[#4a5568]" style={{ fontSize: '1.25rem' }} />
                        <span className="font-sans text-[0.9rem]">{item.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>

              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── 8. Shop FAQ ───────────────────────────────────────────────────── */}
      <section className="border-t border-white/5 py-20 px-6 md:px-12 lg:px-20">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">

          {/* Left: sticky label */}
          <FadeUp className="lg:col-span-4 lg:sticky lg:top-12">
            <h2 className="font-serif text-3xl md:text-4xl font-normal text-[#d9e3f6] mb-4">
              Shop FAQ
            </h2>
            <p className="font-sans text-[#8e9098] text-[0.88rem] leading-relaxed">
              Common questions about pickup, postage, and aircraft-specific resources.
            </p>
          </FadeUp>

          {/* Right: accordion */}
          <FadeUp delay={0.15} duration={1.2} className="lg:col-span-8 space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <FaqItem key={i} question={item.question} answer={item.answer} />
            ))}
          </FadeUp>

        </div>
      </section>

    </main>
  )
}
