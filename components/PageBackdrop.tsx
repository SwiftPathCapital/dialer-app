'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { BACKDROPS, BACKDROP_TINTS, pageKeyFromPathname } from '@/lib/backdrops'

const BLOB_LAYOUT = [
  { top: '-8%', left: '-6%',  size: 46 },
  { top: '22%', left: '78%',  size: 50 },
  { top: '64%', left: '-8%',  size: 42 },
  { top: '78%', left: '70%',  size: 40 },
]

// Fills the page behind everything with either a slow crossfade through configured
// backdrop images (Part 3: images the user generates later), or — until then — a
// themed animated gradient so the app never looks flat. Renders once, globally, from
// the root layout; individual pages don't need to know it's there.
export default function PageBackdrop() {
  const pathname = usePathname()
  const pageKey = pageKeyFromPathname(pathname || '')
  const images = BACKDROPS[pageKey] ?? []
  const [index, setIndex] = useState(0)
  const [animPlayState, setAnimPlayState] = useState<'running' | 'paused'>('running')

  useEffect(() => {
    setIndex(0)
  }, [pageKey])

  useEffect(() => {
    if (images.length < 2) return
    const id = setInterval(() => setIndex(i => (i + 1) % images.length), 14000)
    return () => clearInterval(id)
  }, [images.length])

  useEffect(() => {
    const onVisibility = () => setAnimPlayState(document.hidden ? 'paused' : 'running')
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const tint = BACKDROP_TINTS[pageKey] ?? BACKDROP_TINTS.default

  const blobs = useMemo(
    () => BLOB_LAYOUT.map((b, i) => ({ ...b, color: tint[i % tint.length] })),
    [tint]
  )

  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ backgroundColor: '#0a0a0a' }}
      aria-hidden
    >
      {images.length > 0 ? (
        images.map((src, i) => (
          <div
            key={src}
            className="absolute inset-0 bg-cover bg-center transition-opacity ease-in-out"
            style={{ opacity: i === index ? 1 : 0, transitionDuration: '2500ms' }}
          >
            <div
              className="backdrop-kenburns-loop absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${src})`, animationPlayState: animPlayState }}
            />
          </div>
        ))
      ) : (
        <div className="absolute inset-0 opacity-40">
          {/* Solid blurred circles don't show rotation, so these breathe (opacity + scale)
              and drift slowly instead — a rotating blob would look completely static. */}
          {blobs.map((b, i) => (
            <div
              key={i}
              className="absolute rounded-full blur-3xl"
              style={{
                top: b.top,
                left: b.left,
                width: `${b.size}vmin`,
                height: `${b.size}vmin`,
                background: b.color,
                animation: `core-glow-pulse ${9 + i * 2}s ease-in-out infinite, backdrop-kenburns ${40 + i * 10}s ease-in-out infinite alternate`,
                animationDelay: `${-i * 3}s`,
                animationPlayState: animPlayState,
              }}
            />
          ))}
        </div>
      )}

      {/* Keep foreground content readable regardless of what's behind it */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(5,8,16,0.35)_0%,_rgba(5,8,16,0.6)_65%,_rgba(5,8,16,0.85)_100%)]" />
    </div>
  )
}
