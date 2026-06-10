'use client'

export default function ProfilePreferencesSoon() {
  return (
    <div className="bg-white border border-[#152d5a]/10 rounded-2xl p-6 relative overflow-hidden opacity-60 pointer-events-none select-none">
      <div className="absolute top-3 right-3 pointer-events-none opacity-[0.04]">
        <svg width="72" height="72" fill="none" viewBox="0 0 24 24" stroke="#152d5a" strokeWidth="0.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/>
        </svg>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#fff8ec] flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#e8a020" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/>
            </svg>
          </div>
          <h3 className="font-semibold text-[#152d5a] text-[14px]">Communication Preferences</h3>
        </div>
        <span className="text-[9px] uppercase tracking-widest text-amber-400 border border-amber-400/20 px-2 py-0.5 rounded">Coming Soon</span>
      </div>

      <p className="text-[#6b7ea8] text-[13px] leading-relaxed">
        This section is being redesigned. Notification controls will return here soon.
      </p>
    </div>
  )
}
