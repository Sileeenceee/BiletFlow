/** Numbered step indicator used by multi-step flows (design 4.2 to 4.4). */
export function StepProgress({ steps, current, label }: { steps: string[]; current: number; label: string }) {
  return (
    <ol aria-label={label} className="grid max-w-3xl" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((step, index) => {
        const number = index + 1
        const done = number < current
        const active = number === current
        return (
          <li key={step} aria-current={active ? 'step' : undefined} className="relative flex flex-col items-center text-center">
            {index > 0 && <span aria-hidden="true" className={`absolute right-1/2 top-[15px] h-0.5 w-full ${number <= current ? 'bg-brand-500' : 'bg-slate-300'}`} />}
            <span className={`relative grid size-8 place-items-center rounded-full text-sm font-bold ${done ? 'bg-brand-500 text-white' : active ? 'bg-[#2B4BB5] text-white' : 'border-2 border-slate-300 bg-white text-slate-500'}`}>
              {done ? '✓' : number}
            </span>
            <span className={`mt-2 text-sm ${done || active ? 'font-bold text-slate-900' : 'text-slate-500'}`}>{step}</span>
          </li>
        )
      })}
    </ol>
  )
}
