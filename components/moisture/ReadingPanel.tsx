'use client'

import { useEffect, useState } from 'react'
import { X, Plus, Droplets } from 'lucide-react'
import { MoistureReading, MoistureReadingPoint } from '@/lib/types'

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

interface Props {
  point: MoistureReadingPoint
  agentId: string
  onClose: () => void
  onReadingAdded: () => void
}

export default function ReadingPanel({ point, agentId, onClose, onReadingAdded }: Props) {
  const [readings, setReadings] = useState<MoistureReading[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [level, setLevel] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    fetch(`/api/moisture/points/${point.id}/readings`)
      .then(r => r.json())
      .then(d => { setReadings(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(load, [point.id])

  async function submitReading(e: React.FormEvent) {
    e.preventDefault()
    if (!level.trim()) return
    setSaving(true)
    setError('')
    const res = await fetch(`/api/moisture/points/${point.id}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId, moisture_level: parseFloat(level), notes: notes || null }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Could not save reading'); return }
    setLevel(''); setNotes(''); setShowForm(false)
    load()
    onReadingAdded()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-gray-900 border border-gray-700 sm:rounded-2xl w-full sm:max-w-sm max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4 text-cyan-400" />
            <h3 className="text-white font-semibold text-sm">{point.label || 'Reading Point'}</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : readings.length === 0 ? (
            <p className="text-gray-600 text-sm">No readings logged yet.</p>
          ) : (
            readings.map(r => (
              <div key={r.id} className="bg-gray-800 rounded-lg px-3 py-2.5 border border-gray-700">
                <div className="flex items-center justify-between">
                  <span className="text-white text-lg font-bold">{r.moisture_level}%</span>
                  <span className="text-gray-500 text-xs">{fmtWhen(r.recorded_at)}</span>
                </div>
                {r.notes && <p className="text-gray-400 text-xs mt-1">{r.notes}</p>}
              </div>
            ))
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-800 shrink-0">
          {showForm ? (
            <form onSubmit={submitReading} className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  autoFocus
                  type="number"
                  step="0.1"
                  value={level}
                  onChange={e => setLevel(e.target.value)}
                  placeholder="Moisture %"
                  className="bg-gray-800 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600"
                />
                <p className="text-gray-500 text-xs self-center">Logged now, automatically</p>
              </div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={2}
                className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600 resize-none"
              />
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError('') }}
                  className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !level.trim()}
                  className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {saving ? 'Saving…' : 'Save Reading'}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="neon-pulse w-full flex items-center justify-center gap-2 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded-lg transition-colors"
              style={{ '--glow-color': '#22d3ee' } as React.CSSProperties}
            >
              <Plus className="w-4 h-4" /> Add Reading
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
