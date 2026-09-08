'use client'

import { useRef } from 'react'
import { MapPin } from 'lucide-react'
import { MoistureShape, MoistureReadingPoint } from '@/lib/types'

// Rough visual aid only, not a certified moisture-inspection standard — a contractor
// can eyeball their own thresholds; this just gives the pin a quick dry/caution/wet cue.
function pinColor(level: number | undefined) {
  if (level === undefined) return '#9ca3af' // no reading yet
  if (level < 15) return '#34d399' // dry
  if (level < 25) return '#fbbf24' // caution
  return '#f87171' // wet
}

interface Props {
  imageUrl?: string | null
  shapes?: MoistureShape[]
  points: MoistureReadingPoint[]
  onCanvasTap: (x: number, y: number) => void
  onPointTap: (point: MoistureReadingPoint) => void
}

export default function FloorPlanCanvas({ imageUrl, shapes, points, onCanvasTap, onPointTap }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null)

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    onCanvasTap(Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)))
  }

  return (
    <div
      ref={canvasRef}
      onClick={handleCanvasClick}
      className="relative w-full aspect-[4/3] bg-gray-900 rounded-xl border border-gray-700 overflow-hidden cursor-crosshair select-none touch-none"
      style={imageUrl ? { backgroundImage: `url(${imageUrl})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundColor: '#111827' } : undefined}
    >
      {!imageUrl && (shapes ?? []).map(shape => (
        <div
          key={shape.id}
          className="absolute border-2 border-cyan-500/50 bg-cyan-500/10 rounded-sm flex items-center justify-center pointer-events-none"
          style={{
            left: `${shape.x}%`,
            top: `${shape.y}%`,
            width: `${shape.width}%`,
            height: `${shape.height}%`,
            transform: `rotate(${shape.rotation}deg)`,
          }}
        >
          {shape.label && <span className="text-cyan-200 text-[10px] font-medium px-1 text-center truncate">{shape.label}</span>}
        </div>
      ))}

      {points.map(point => (
        <button
          key={point.id}
          onClick={e => { e.stopPropagation(); onPointTap(point) }}
          className="absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center border-2 border-white/80 shadow-lg transition-transform hover:scale-125 z-10"
          style={{ left: `${point.x}%`, top: `${point.y}%`, backgroundColor: pinColor(point.latest_reading?.moisture_level) }}
          title={point.label || 'Reading point'}
        >
          <MapPin className="w-4 h-4 text-white" />
        </button>
      ))}

      {points.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm pointer-events-none px-6 text-center">
          Tap anywhere on the floor plan to place the first reading point
        </p>
      )}
    </div>
  )
}
