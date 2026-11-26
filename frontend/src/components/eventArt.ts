import type { ComponentType, SVGProps } from 'react'
import { ChartIcon, FlagIcon, TagIcon, TicketIcon, UsersIcon } from './icons'

export type Art = { gradient: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }

// Category artwork from the design file; unknown categories get one of these by a stable hash.
const ARTS: Art[] = [
  { gradient: 'from-[#1E7A93] to-[#164E63]', Icon: TicketIcon },
  { gradient: 'from-[#2563EB] to-[#1E3A8A]', Icon: UsersIcon },
  { gradient: 'from-[#059669] to-[#065F46]', Icon: FlagIcon },
  { gradient: 'from-[#7C3AED] to-[#4C1D95]', Icon: TicketIcon },
  { gradient: 'from-[#F59E0B] to-[#C2410C]', Icon: TagIcon },
  { gradient: 'from-[#E11D48] to-[#881337]', Icon: ChartIcon },
]
const NAMED: Record<string, number> = {
  music: 0, музыка: 0,
  business: 1, бизнес: 1,
  community: 2, сообщество: 2,
  arts: 3, art: 3, искусство: 3, өнер: 3,
  food: 4, еда: 4, тағам: 4,
  technology: 5, tech: 5, технологии: 5,
}

export function eventArt(category?: string | null): Art {
  const key = (category ?? '').trim().toLocaleLowerCase()
  if (key in NAMED) return ARTS[NAMED[key]]
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return ARTS[hash % ARTS.length]
}
