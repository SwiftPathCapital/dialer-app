// Per-page backdrop images (Part 3 of the visual pass: alternating/animated page
// backdrops). Drop generated images into public/backdrops/<key>/ and list their
// paths here, in the order they should cycle — PageBackdrop crossfades through
// them automatically. A key with no entry (or an empty array) falls back to an
// animated themed gradient so every page still feels alive before real art lands.
//
// Key = the route with '/' replaced by '-' and the leading slash stripped, e.g.
// '/admin/tenants' -> 'admin-tenants', '/dashboard' -> 'dashboard', '/' -> 'login'.
export const BACKDROPS: Record<string, string[]> = {
  // 'dashboard': ['/backdrops/dashboard/1.png', '/backdrops/dashboard/2.png'],
}

// Shared rotation used by every page that doesn't have its own dedicated set above.
// Control Center is the one exception — it renders its own full-bleed background
// directly in its own page component, so it never reaches this fallback.
export const DEFAULT_BACKDROPS: string[] = [
  '/backdrops/shared/1.webp',
  '/backdrops/shared/2.webp',
  '/backdrops/shared/3.webp',
]

// Fallback tint per page, used only when no images are configured for that key —
// keeps the "uniform but slightly different" feel even before real art exists.
export const BACKDROP_TINTS: Record<string, [string, string, string, string]> = {
  'control-center': ['#22d3ee', '#a78bfa', '#f472b6', '#2dd4bf'],
  'dashboard':      ['#22d3ee', '#38bdf8', '#818cf8', '#2dd4bf'],
  'contact-center': ['#38bdf8', '#a78bfa', '#f472b6', '#22d3ee'],
  'voicemail':      ['#a78bfa', '#818cf8', '#38bdf8', '#c084fc'],
  'callbacks':      ['#fbbf24', '#f472b6', '#a78bfa', '#38bdf8'],
  'calls':          ['#34d399', '#22d3ee', '#818cf8', '#38bdf8'],
  'calendar':       ['#f472b6', '#c084fc', '#22d3ee', '#818cf8'],
  'leads':          ['#38bdf8', '#34d399', '#818cf8', '#22d3ee'],
  'login':          ['#22d3ee', '#818cf8', '#2dd4bf', '#a78bfa'],
  default:          ['#22d3ee', '#a78bfa', '#38bdf8', '#2dd4bf'],
}

export function pageKeyFromPathname(pathname: string): string {
  const clean = pathname.replace(/^\/+/, '').replace(/\/+$/, '')
  if (!clean) return 'login'
  return clean.replace(/\//g, '-')
}
