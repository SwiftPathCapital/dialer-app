'use client'

import { LucideIcon } from 'lucide-react'

// Every "Coming Soon" page shares this component, so they all get the same signature
// glow pattern (breathe — the calmest of the set, fitting for a page with no action to
// take yet) with a per-page color, satisfying "uniform but slightly different" at the
// family level even though each page is otherwise just an icon and a caption.
export default function ComingSoon({
  icon: Icon,
  title,
  description,
  glowColor = '#22d3ee',
}: {
  icon: LucideIcon
  title: string
  description: string
  glowColor?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[70vh] text-center px-6">
      <div
        className="neon-breathe w-20 h-20 rounded-full bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center mb-5"
        style={{ '--glow-color': glowColor, borderColor: `${glowColor}66` } as React.CSSProperties}
      >
        <Icon className="w-9 h-9" style={{ color: glowColor }} />
      </div>
      <h1 className="text-white text-2xl font-bold">{title}</h1>
      <p className="text-gray-500 text-sm mt-2 max-w-sm">{description}</p>
      <span
        className="mt-5 text-xs uppercase tracking-widest border rounded-full px-3 py-1"
        style={{ color: `${glowColor}b3`, borderColor: `${glowColor}4d` }}
      >
        Coming Soon
      </span>
    </div>
  )
}
