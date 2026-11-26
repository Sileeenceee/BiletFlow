import type { ReactNode, SVGProps } from 'react'

/** Line icons matching the design file (1.75px stroke, 24px grid). */
function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  )
}

type P = SVGProps<SVGSVGElement>

export const SearchIcon = (p: P) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>
export const PinIcon = (p: P) => <Icon {...p}><path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></Icon>
export const CalendarIcon = (p: P) => <Icon {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Icon>
export const TicketIcon = (p: P) => <Icon {...p}><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2.5a2.5 2.5 0 0 0 0-5Z" /><path d="M10 5v14M14 5v14" /></Icon>
export const UsersIcon = (p: P) => <Icon {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14a6.5 6.5 0 0 1 3 6" /></Icon>
export const FlagIcon = (p: P) => <Icon {...p}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></Icon>
export const TagIcon = (p: P) => <Icon {...p}><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9Z" /><circle cx="8" cy="8" r="1.5" /></Icon>
export const ChartIcon = (p: P) => <Icon {...p}><path d="M6 20v-7M12 20V5M18 20v-10" /></Icon>
export const ScanIcon = (p: P) => <Icon {...p}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" /></Icon>
export const UserIcon = (p: P) => <Icon {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon>
export const BellIcon = (p: P) => <Icon {...p}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></Icon>
export const MenuIcon = (p: P) => <Icon {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>
export const DownloadIcon = (p: P) => <Icon {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Icon>
export const PrinterIcon = (p: P) => <Icon {...p}><path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2" /><rect x="7" y="14" width="10" height="6" rx="1" /></Icon>
export const ListIcon = (p: P) => <Icon {...p}><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></Icon>
export const ChatIcon = (p: P) => <Icon {...p}><path d="M4 5h16v11H9l-5 4Z" /></Icon>
export const AlertIcon = (p: P) => <Icon {...p}><path d="M12 4 2.5 20h19Z" /><path d="M12 10v4M12 17h.01" /></Icon>
export const PlusIcon = (p: P) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
export const HomeIcon = (p: P) => <Icon {...p}><path d="M4 11 12 4l8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1Z" /></Icon>
export const SettingsIcon = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></Icon>
export const ShieldIcon = (p: P) => <Icon {...p}><path d="M12 3 4.5 6v6c0 4.5 3.2 8 7.5 9 4.3-1 7.5-4.5 7.5-9V6Z" /></Icon>
export const InfoIcon = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Icon>
export const CheckIcon = (p: P) => <Icon {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>
export const UploadIcon = (p: P) => <Icon {...p}><path d="M12 16V5M7 10l5-5 5 5M5 20h14" /></Icon>
export const EyeIcon = (p: P) => <Icon {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></Icon>
export const ClockIcon = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>
export const ChevronDownIcon = (p: P) => <Icon {...p}><path d="m6 9 6 6 6-6" /></Icon>
export const ChevronLeftIcon = (p: P) => <Icon {...p}><path d="m15 6-6 6 6 6" /></Icon>
export const ChevronRightIcon = (p: P) => <Icon {...p}><path d="m9 6 6 6-6 6" /></Icon>
