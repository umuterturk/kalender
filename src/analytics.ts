const MEASUREMENT_ID = 'G-5BM4G7XB1H'

function measurementId(): string | null {
  if (!import.meta.env.PROD) return null
  return MEASUREMENT_ID
}

/** Drop person ids so a page view is a route, not a roster record. */
export function analyticsPath(pathname: string): string {
  return pathname.replace(/\/people\/[^/]+/g, '/people/:id')
}

export function initAnalytics(): void {
  const id = measurementId()
  if (!id) return

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`
  document.head.appendChild(script)

  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer?.push(args)
  }
  window.gtag('js', new Date())
  window.gtag('config', id, { send_page_view: false })
}

export type AnalyticsEvent =
  | 'plan'
  | 'publish'
  | 'clear_month'
  | 'export'
  | 'import'
  | 'roster_created'
  | 'actual_confirmed'

export type AnalyticsParams = {
  month?: string
  locale?: 'en' | 'tr'
  workable?: 'yes' | 'no'
}

export function trackEvent(name: AnalyticsEvent, params: AnalyticsParams = {}): void {
  if (!measurementId() || !window.gtag) return
  window.gtag('event', name, params)
}

export function trackPageView(pathname: string): void {
  const id = measurementId()
  if (!id || !window.gtag) return

  const page_path = analyticsPath(pathname)
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  window.gtag('event', 'page_view', {
    page_title: document.title,
    page_path,
    page_location: `${location.origin}${base}${page_path}`,
  })
}
