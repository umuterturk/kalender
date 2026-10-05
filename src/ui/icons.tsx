import type { ReactNode } from 'react'
import { IconBeach, IconCheck, IconX } from '@tabler/icons-react'

type IconProps = {
  size?: number
  className?: string
}

function Svg({ size = 20, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  )
}

export function IconCalendar(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M8 3v4M16 3v4" />
    </Svg>
  )
}

export function IconPeople(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3.2 2.7-5 5.5-5s4.9 1.8 5.5 5" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15 19c.3-1.8 1.4-3.2 3.2-3.8" />
    </Svg>
  )
}

export function IconSliders(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h10M18 7h2M14 4v6M4 17h4M12 17h8M8 14v6" />
    </Svg>
  )
}

export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.9 6.5l1.6 1.6M17.5 15.9l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.5l1.6-1.6M17.5 8.1l1.6-1.6" />
    </Svg>
  )
}

export function IconChevronLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </Svg>
  )
}

export function IconChevronRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.5 5.5 16 12l-6.5 6.5" />
    </Svg>
  )
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  )
}

export function IconLock(props: IconProps) {
  return (
    <Svg {...props} size={props.size ?? 14}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  )
}

export function IconWarn(props: IconProps) {
  return (
    <Svg {...props} size={props.size ?? 14}>
      <path d="M12 4 21 19H3L12 4z" />
      <path d="M12 10v4M12 16.5v.5" />
    </Svg>
  )
}

export function IconMore(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconWand(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20 13.5 10.5" />
      <path d="m12.2 9.2 2.6 2.6" />
      <path d="M16.5 4v3.5M14.75 5.75H18.25" />
      <path d="M19.75 10.5v2.5M18.5 11.75h2.5" />
    </Svg>
  )
}

export function IconHoliday(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M12 12.4 13.1 14.6 15.6 15l-1.8 1.7.4 2.5L12 18l-2.2 1.2.4-2.5L8.4 15l2.5-.4Z" />
    </Svg>
  )
}

export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 7h14M9 7V5h6v2M8 7l.8 12h6.4L16 7" />
      <path d="M10 11v5M14 11v5" />
    </Svg>
  )
}

export function IconPublish(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 16V5" />
      <path d="m8 9 4-4 4 4" />
      <path d="M5 19h14" />
    </Svg>
  )
}

export function IconPrefYes({ size = 20, className }: IconProps) {
  return <IconCheck size={size} stroke={2} className={className} aria-hidden />
}

export function IconPrefNo({ size = 20, className }: IconProps) {
  return <IconX size={size} stroke={2} className={className} aria-hidden />
}

export function IconVacation({ size = 20, className }: IconProps) {
  return <IconBeach size={size} stroke={1.75} className={className} aria-hidden />
}
