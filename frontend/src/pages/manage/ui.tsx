import type { ReactNode } from 'react'

export const card = 'rounded-2xl border border-slate-200 bg-white'
export const tableWrap = 'overflow-x-auto rounded-2xl border border-slate-200 bg-white'
export const table = 'w-full text-left text-[15px]'
export const thead = 'bg-[#F1F5F9] text-sm text-slate-700'
export const th = 'px-4 py-3 font-bold'
export const td = 'px-4 py-3.5'
export const sectionTitle = 'font-display text-[26px] font-bold text-slate-900'
export const secondaryButton = 'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
export const dangerButton = 'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-5 text-sm font-bold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50'

/** Stat card with an icon chip (design 4.5 and 4.10). */
export function StatCard({ label, value, hint, icon, tone = 'slate' }: { label: string; value: string; hint?: string; icon?: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'rose' }) {
  const valueTone = { slate: 'text-slate-900', green: 'text-[#15803D]', amber: 'text-[#B45309]', rose: 'text-[#B91C1C]' }[tone]
  return (
    <div className={`${card} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-600">{label}</p>
        {icon && <span className="grid size-9 place-items-center rounded-lg bg-[#EEF3FE] text-brand-500">{icon}</span>}
      </div>
      <p className={`mt-1 font-display text-[28px] font-bold ${valueTone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs font-bold text-slate-600">{hint}</p>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{children}</p>
}
