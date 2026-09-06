'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Users, FolderPlus, Folder, X, CalendarDays } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

const COLORS = ['#22d3ee', '#a78bfa', '#2dd4bf', '#fbbf24', '#f472b6', '#3b82f6', '#ef4444', '#22c55e']

interface Member {
  agent_id: string
  can_edit: boolean
  agents: { id: string; name: string } | null
}

interface CalendarRow {
  id: string
  name: string
  color: string
  type: 'personal' | 'team'
  owner_agent_id: string | null
  group_id: string | null
  calendar_groups: { id: string; name: string } | null
  calendar_members: Member[]
}

interface Group {
  id: string
  name: string
  sort_order: number
}

interface AgentLite {
  id: string
  name: string
  email: string
}

export default function AdminCalendarsPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()

  const [calendars, setCalendars] = useState<CalendarRow[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [agents, setAgents] = useState<AgentLite[]>([])
  const [loading, setLoading] = useState(true)

  const [newCalName, setNewCalName] = useState('')
  const [newCalColor, setNewCalColor] = useState(COLORS[0])
  const [newCalGroup, setNewCalGroup] = useState('')
  const [savingCal, setSavingCal] = useState(false)

  const [newGroupName, setNewGroupName] = useState('')
  const [savingGroup, setSavingGroup] = useState(false)

  const [addingMemberFor, setAddingMemberFor] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([
      fetch('/api/calendars?all=true').then(r => r.json()),
      fetch('/api/admin/calendar-groups').then(r => r.json()),
      fetch('/api/agents').then(r => r.json()),
    ]).then(([cals, grps, ags]) => {
      setCalendars(Array.isArray(cals) ? cals : [])
      setGroups(Array.isArray(grps) ? grps : [])
      setAgents(Array.isArray(ags) ? ags : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (agentLoading) return
    if (!agent || agent.role !== 'admin') { router.push('/dashboard'); return }
    load()
  }, [agent, agentLoading, router, load])

  if (!agent) return null

  const teamCalendars = calendars.filter(c => c.type === 'team')
  const personalCalendars = calendars.filter(c => c.type === 'personal')

  async function createCalendar(e: React.FormEvent) {
    e.preventDefault()
    if (!newCalName.trim()) return
    setSavingCal(true)
    await fetch('/api/calendars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCalName.trim(), color: newCalColor, group_id: newCalGroup || null }),
    })
    setNewCalName('')
    setNewCalColor(COLORS[0])
    setNewCalGroup('')
    setSavingCal(false)
    load()
  }

  async function renameCalendar(id: string, name: string) {
    setCalendars(prev => prev.map(c => c.id === id ? { ...c, name } : c))
    await fetch('/api/calendars', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name }),
    })
  }

  async function setCalendarColor(id: string, color: string) {
    setCalendars(prev => prev.map(c => c.id === id ? { ...c, color } : c))
    await fetch('/api/calendars', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, color }),
    })
  }

  async function setCalendarGroup(id: string, groupId: string) {
    const group = groups.find(g => g.id === groupId) || null
    setCalendars(prev => prev.map(c => c.id === id ? { ...c, group_id: groupId || null, calendar_groups: group } : c))
    await fetch('/api/calendars', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, group_id: groupId || null }),
    })
  }

  async function deleteCalendar(id: string) {
    if (!confirm('Delete this team calendar? All its events will be removed.')) return
    await fetch(`/api/calendars?id=${id}`, { method: 'DELETE' })
    load()
  }

  async function createGroup(e: React.FormEvent) {
    e.preventDefault()
    if (!newGroupName.trim()) return
    setSavingGroup(true)
    await fetch('/api/admin/calendar-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newGroupName.trim() }),
    })
    setNewGroupName('')
    setSavingGroup(false)
    load()
  }

  async function renameGroup(id: string, name: string) {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, name } : g))
    await fetch('/api/admin/calendar-groups', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name }),
    })
  }

  async function deleteGroup(id: string) {
    if (!confirm('Delete this group? Its calendars will become ungrouped, not deleted.')) return
    await fetch(`/api/admin/calendar-groups?id=${id}`, { method: 'DELETE' })
    load()
  }

  async function addMember(calendarId: string, agentId: string) {
    setAddingMemberFor(null)
    await fetch('/api/admin/calendars/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendar_id: calendarId, agent_id: agentId, can_edit: true }),
    })
    load()
  }

  async function toggleMemberCanEdit(calendarId: string, agentId: string, canEdit: boolean) {
    setCalendars(prev => prev.map(c => c.id !== calendarId ? c : {
      ...c,
      calendar_members: c.calendar_members.map(m => m.agent_id === agentId ? { ...m, can_edit: canEdit } : m),
    }))
    await fetch('/api/admin/calendars/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendar_id: calendarId, agent_id: agentId, can_edit: canEdit }),
    })
  }

  async function removeMember(calendarId: string, agentId: string) {
    await fetch(`/api/admin/calendars/members?calendar_id=${calendarId}&agent_id=${agentId}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="p-6 max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Calendars</h1>
        <p className="text-gray-400 text-sm mt-0.5">Create shared team calendars, organize them into groups, and control who can edit each one.</p>
      </div>

      {/* Groups */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Folder className="w-4 h-4 text-gray-400" />
          <h2 className="text-white font-semibold">Groups</h2>
          <p className="text-gray-500 text-xs">Fold related calendars together so agents can show/hide them all at once.</p>
        </div>

        <form onSubmit={createGroup} className="flex items-center gap-2 mb-3">
          <input
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            placeholder="e.g. Sales Team, Support"
            className="flex-1 max-w-xs bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600"
          />
          <button
            type="submit"
            disabled={savingGroup || !newGroupName.trim()}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" /> Add Group
          </button>
        </form>

        {groups.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {groups.map(g => (
              <div key={g.id} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5">
                <input
                  defaultValue={g.name}
                  onBlur={e => { if (e.target.value.trim() && e.target.value !== g.name) renameGroup(g.id, e.target.value.trim()) }}
                  className="bg-transparent text-white text-sm outline-none w-28"
                />
                <span className="text-gray-600 text-xs">{teamCalendars.filter(c => c.group_id === g.id).length} cal</span>
                <button onClick={() => deleteGroup(g.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Team calendars */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-gray-400" />
          <h2 className="text-white font-semibold">Team Calendars</h2>
        </div>

        <form onSubmit={createCalendar} className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-4">
          <label className="text-gray-400 text-xs uppercase tracking-widest mb-2 block">New Team Calendar</label>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              value={newCalName}
              onChange={e => setNewCalName(e.target.value)}
              placeholder="e.g. Sales Appointments"
              className="flex-1 min-w-[180px] bg-gray-900 text-white text-sm rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600"
            />
            <div className="flex items-center gap-1.5">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewCalColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${newCalColor === c ? 'ring-2 ring-white scale-110' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <select
              value={newCalGroup}
              onChange={e => setNewCalGroup(e.target.value)}
              className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">No group</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button
              type="submit"
              disabled={savingCal || !newCalName.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" /> Create
            </button>
          </div>
        </form>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : teamCalendars.length === 0 ? (
          <p className="text-gray-600 text-sm">No team calendars yet — create one above.</p>
        ) : (
          <div className="space-y-3">
            {teamCalendars.map(cal => {
              const memberIds = new Set(cal.calendar_members.map(m => m.agent_id))
              const availableAgents = agents.filter(a => !memberIds.has(a.id))
              return (
                <div key={cal.id} className="bg-gray-800 rounded-xl border border-gray-700 p-4">
                  <div className="flex items-center gap-3 flex-wrap mb-3">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: cal.color }} />
                    <input
                      defaultValue={cal.name}
                      onBlur={e => { if (e.target.value.trim() && e.target.value !== cal.name) renameCalendar(cal.id, e.target.value.trim()) }}
                      className="bg-transparent text-white font-medium text-sm outline-none flex-1 min-w-[140px]"
                    />
                    <div className="flex items-center gap-1">
                      {COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => setCalendarColor(cal.id, c)}
                          className={`w-4 h-4 rounded-full transition-transform ${cal.color === c ? 'ring-2 ring-white scale-110' : ''}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <select
                      value={cal.group_id || ''}
                      onChange={e => setCalendarGroup(cal.id, e.target.value)}
                      className="bg-gray-900 border border-gray-700 text-gray-300 text-xs rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">No group</option>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    <button onClick={() => deleteCalendar(cal.id)} className="text-gray-600 hover:text-red-400 transition-colors shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-gray-500 text-[10px] uppercase tracking-widest mb-1.5">Members</p>
                  <div className="flex flex-wrap gap-2 items-center">
                    {cal.calendar_members.map(m => (
                      <div key={m.agent_id} className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-full pl-3 pr-1.5 py-1">
                        <span className="text-gray-300 text-xs">{m.agents?.name || 'Unknown'}</span>
                        <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer" title="Can create/edit events on this calendar">
                          <input
                            type="checkbox"
                            checked={m.can_edit}
                            onChange={e => toggleMemberCanEdit(cal.id, m.agent_id, e.target.checked)}
                            className="w-3 h-3 rounded accent-cyan-500"
                          />
                          edit
                        </label>
                        <button onClick={() => removeMember(cal.id, m.agent_id)} className="text-gray-600 hover:text-red-400 transition-colors p-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}

                    {addingMemberFor === cal.id ? (
                      <select
                        autoFocus
                        defaultValue=""
                        onChange={e => e.target.value && addMember(cal.id, e.target.value)}
                        onBlur={() => setAddingMemberFor(null)}
                        className="bg-gray-900 border border-gray-700 text-white text-xs rounded-full px-2 py-1 outline-none focus:ring-2 focus:ring-cyan-500"
                      >
                        <option value="" disabled>Select agent…</option>
                        {availableAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    ) : (
                      <button
                        onClick={() => setAddingMemberFor(cal.id)}
                        disabled={availableAgents.length === 0}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-gray-700 text-gray-500 hover:text-white hover:border-gray-500 disabled:opacity-30 text-xs transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Add member
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Personal calendars — read-only, auto-created per agent */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays className="w-4 h-4 text-gray-400" />
          <h2 className="text-white font-semibold">Personal Calendars</h2>
          <p className="text-gray-500 text-xs">Every agent gets one automatically — nothing to configure here.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {personalCalendars.map(cal => (
            <div key={cal.id} className="flex items-center gap-2 bg-gray-800/60 border border-gray-800 rounded-full px-3 py-1.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cal.color }} />
              <span className="text-gray-400 text-xs">{cal.name}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
