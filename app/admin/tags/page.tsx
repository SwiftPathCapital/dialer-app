'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Tag as TagIcon } from 'lucide-react'
import { Tag } from '@/lib/types'
import { useSoftphone } from '@/lib/SoftphoneContext'

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#f97316', '#14b8a6']

export default function TagsPage() {
  const { agent } = useSoftphone()
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [agent])

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/admin/tags${agent ? `?agent_id=${agent.id}` : ''}`)
    const data = await res.json()
    setTags(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function createTag(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    await fetch('/api/admin/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), color, agent_id: agent?.id }),
    })
    setName('')
    setColor(COLORS[0])
    setSaving(false)
    load()
  }

  async function deleteTag(id: string) {
    if (!confirm('Delete this tag? It will be removed from all contacts.')) return
    await fetch(`/api/admin/tags?id=${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Tags</h1>
        <p className="text-gray-400 text-sm mt-0.5">Create tags that agents can apply to contacts.</p>
      </div>

      <form onSubmit={createTag} className="bg-gray-800 rounded-xl border border-gray-700 p-5 mb-6">
        <label className="text-gray-400 text-xs uppercase tracking-widest mb-2 block">New Tag</label>
        <div className="flex items-center gap-3">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Hot Lead, VIP, Follow Up"
            className="flex-1 bg-gray-900 text-white text-sm rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
          />
          <div className="flex items-center gap-1.5">
            {COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'ring-2 ring-white scale-110' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className={`flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors shrink-0 ${
              !saving && name.trim() ? 'neon-flicker' : ''
            }`}
            style={{ '--glow-color': '#3b82f6' } as React.CSSProperties}
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </form>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        {loading ? (
          <p className="text-gray-500 text-sm p-6">Loading…</p>
        ) : tags.length === 0 ? (
          <p className="text-gray-600 text-sm p-6">No tags yet — create one above.</p>
        ) : (
          <div className="divide-y divide-gray-700">
            {tags.map(tag => (
              <div key={tag.id} className="flex items-center justify-between px-5 py-3">
                <span
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: tag.color }}
                >
                  <TagIcon className="w-3 h-3" /> {tag.name}
                </span>
                <button
                  onClick={() => deleteTag(tag.id)}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
