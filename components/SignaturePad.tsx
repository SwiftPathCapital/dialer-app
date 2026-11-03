'use client'

import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

// Draw-to-sign box. Calls onChange with a PNG data URL (white background, dark ink), or
// null when cleared. Works with mouse, touch and pen via pointer events.
export default function SignaturePad({ onChange, disabled }: { onChange: (png: string | null) => void; disabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [empty, setEmpty] = useState(true)

  function setup() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * ratio)
    canvas.height = Math.round(rect.height * ratio)
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  useEffect(() => { setup() }, [])

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = point(e)
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return
    const ctx = e.currentTarget.getContext('2d')!
    const p = point(e)
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    if (empty) setEmpty(false)
  }

  function up() {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    if (!empty) onChange(canvasRef.current!.toDataURL('image/png'))
  }

  function clear() {
    setup()
    setEmpty(true)
    onChange(null)
  }

  return (
    <div>
      <div className="relative rounded-lg overflow-hidden border border-gray-600 bg-white">
        <canvas
          ref={canvasRef}
          aria-label="Signature box: draw your signature"
          className="block w-full h-36 touch-none cursor-crosshair"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
        />
        {empty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Draw your signature here</span>}
      </div>
      <button type="button" onClick={clear} disabled={disabled || empty} className="mt-2 flex items-center gap-1.5 text-xs text-gray-400 hover:text-white disabled:opacity-40">
        <Eraser className="w-3.5 h-3.5" /> Clear
      </button>
    </div>
  )
}
