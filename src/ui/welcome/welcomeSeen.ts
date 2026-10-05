export const WELCOME_KEY = 'kalender.welcomeSeen'

export function welcomeHasBeenSeen(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1'
  } catch {
    return false
  }
}

export function markWelcomeSeen(): void {
  try { localStorage.setItem(WELCOME_KEY, '1') } catch { /* ignore */ }
}

export function resetWelcomeSeen(): void {
  try { localStorage.removeItem(WELCOME_KEY) } catch { /* ignore */ }
}
