'use client'

import { LucideIcon } from 'lucide-react'

export default function ComingSoon({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[70vh] text-center px-6">
      <div className="w-20 h-20 rounded-full bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(34,211,238,0.25)]">
        <Icon className="w-9 h-9 text-cyan-400" />
      </div>
      <h1 className="text-white text-2xl font-bold">{title}</h1>
      <p className="text-gray-500 text-sm mt-2 max-w-sm">{description}</p>
      <span className="mt-5 text-xs uppercase tracking-widest text-cyan-500/70 border border-cyan-500/30 rounded-full px-3 py-1">
        Coming Soon
      </span>
    </div>
  )
}
