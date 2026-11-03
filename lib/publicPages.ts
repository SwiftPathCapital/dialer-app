// Customer-facing pages (no login, no agent chrome): booking and e-signature links.
export function isPublicPage(pathname: string | null | undefined): boolean {
  return !!pathname && (pathname.startsWith('/book/') || pathname.startsWith('/sign/'))
}
