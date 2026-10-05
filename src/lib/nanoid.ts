/** Tiny browser-native nanoid replacement. */
export function nanoid(size = 21): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
  return Array.from(bytes, b => alphabet[b & 63]).join('')
}
