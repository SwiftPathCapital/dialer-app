'use client'

import { useRef, useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { MoistureShape } from '@/lib/types'

const GRID = 2 // snap increment, in percent of canvas
function snap(v: number) {
  return Math.round(v / GRID) * GRID
}
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

// Pre-sized presets a tech can drop onto the canvas and fine-tune — not a parametric
// wall system, just boxes sized to roughly match common room/hallway proportions.
const PRESETS: { key: MoistureShape['kind']; label: string; width: number; height: number }[] = [
  { key: 'room', label: 'Small Room',  width: 16, height: 16 },
  { key: 'room', label: 'Medium Room', width: 24, height: 18 },
  { key: 'room', label: 'Large Room',  width: 32, height: 24 },
  { key: 'hallway', label: 'Hallway',  width: 30, height: 8 },
  { key: 'wall', label: 'Wall',        width: 20, height: 3 },
]

let placeCounter = 0

interface Props {
  shapes: MoistureShape[]
  onChange: (shapes: MoistureShape[]) => void
}

export default function ShapeComposer({ shapes, onChange }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  function addShape(preset: typeof PRESETS[number]) {
    placeCounter += 1
    const offset = (placeCounter % 5) * 4 // cascade repeated adds so they don't stack exactly
    const shape: MoistureShape = {
      id: `${Date.now()}-${placeCounter}`,
      kind: preset.key,
      x: snap(clamp(10 + offset, 0, 100 - preset.width)),
      y: snap(clamp(10 + offset, 0, 100 - preset.height)),
      width: preset.width,
      height: preset.height,
      rotation: 0,
      label: preset.label,
    }
    onChange([...shapes, shape])
    setSelectedId(shape.id)
  }

  function updateShape(id: string, updates: Partial<MoistureShape>) {
    onChange(shapes.map(s => (s.id === id ? { ...s, ...updates } : s)))
  }

  function deleteShape(id: string) {
    onChange(shapes.filter(s => s.id !== id))
    setSelectedId(null)
  }

  function handleDragPointerDown(e: React.PointerEvent, shape: MoistureShape) {
    e.stopPropagation()
    setSelectedId(shape.id)
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const startShapeX = shape.x
    const startShapeY = shape.y

    function onMove(ev: PointerEvent) {
      const dxPct = ((ev.clientX - startX) / rect.width) * 100
      const dyPct = ((ev.clientY - startY) / rect.height) * 100
      updateShape(shape.id, {
        x: snap(clamp(startShapeX + dxPct, 0, 100 - shape.width)),
        y: snap(clamp(startShapeY + dyPct, 0, 100 - shape.height)),
      })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function handleResizePointerDown(e: React.PointerEvent, shape: MoistureShape) {
    e.stopPropagation()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const startW = shape.width
    const startH = shape.height

    function onMove(ev: PointerEvent) {
      const dwPct = ((ev.clientX - startX) / rect.width) * 100
      const dhPct = ((ev.clientY - startY) / rect.height) * 100
      updateShape(shape.id, {
        width: snap(clamp(startW + dwPct, 6, 100 - shape.x)),
        height: snap(clamp(startH + dhPct, 6, 100 - shape.y)),
      })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div>
      {/* Shape palette — tap to drop a preset onto the canvas, then drag/resize it into place */}
      <div className="flex flex-wrap gap-2 mb-3">
        {PRESETS.map(p => (
          <button
            key={p.label}
            type="button"
            onClick={() => addShape(p)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> {p.label}
          </button>
        ))}
      </div>

      <div
        ref={canvasRef}
        onPointerDown={() => setSelectedId(null)}
        className="relative w-full aspect-[4/3] bg-gray-900 rounded-xl border border-gray-700 overflow-hidden touch-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: `${GRID * 2}% ${GRID * 2}%`,
        }}
      >
        {shapes.map(shape => (
          <div
            key={shape.id}
            onPointerDown={e => handleDragPointerDown(e, shape)}
            className={`absolute border-2 rounded-sm cursor-move flex items-center justify-center ${
              selectedId === shape.id ? 'border-cyan-400 bg-cyan-500/20' : 'border-cyan-600/50 bg-cyan-500/10'
            }`}
            style={{ left: `${shape.x}%`, top: `${shape.y}%`, width: `${shape.width}%`, height: `${shape.height}%` }}
          >
            <span className="text-cyan-100 text-[10px] font-medium px-1 text-center truncate pointer-events-none">{shape.label}</span>

            {selectedId === shape.id && (
              <>
                <button
                  type="button"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); deleteShape(shape.id) }}
                  className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
                <div
                  onPointerDown={e => handleResizePointerDown(e, shape)}
                  className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-cyan-400 rounded-full border-2 border-gray-900 cursor-nwse-resize"
                />
              </>
            )}
          </div>
        ))}

        {shapes.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm pointer-events-none px-6 text-center">
            Tap a shape above to start building the layout
          </p>
        )}
      </div>
      <p className="text-gray-500 text-xs mt-2">Drag a shape to move it, drag its corner to resize. Tap a shape to select it, then use the trash icon to remove it.</p>
    </div>
  )
}
