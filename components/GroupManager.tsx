'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Users } from 'lucide-react'
import { Agent, InboundGroup } from '@/lib/types'

interface GroupWithMembers extends InboundGroup {
  inbound_group_members: { agent_id: string; agents: Agent }[]
}

export default function GroupManager() {
  const [groups, setGroups] = useState<GroupWithMembers[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [selected, setSelected] = useState<GroupWithMembers | null>(null)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    const [g, a] = await Promise.all([
      fetch('/api/groups').then(r => r.json()),
      fetch('/api/agents').then(r => r.json()),
    ])
    setGroups(Array.isArray(g) ? g : [])
    setAgents(Array.isArray(a) ? a : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function createGroup() {
    if (!newName.trim()) return
    setCreating(true)
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), phone_number: newPhone.trim() || null }),
    })
    const group = await res.json()
    setNewName('')
    setNewPhone('')
    setCreating(false)
    await load()
    setSelected(group)
  }

  async function deleteGroup(id: string) {
    if (!confirm('Delete this group?')) return
    await fetch(`/api/groups?id=${id}`, { method: 'DELETE' })
    if (selected?.id === id) setSelected(null)
    await load()
  }

  async function toggleMember(groupId: string, agentId: string, isMember: boolean) {
    const current = selected?.inbound_group_members.map(m => m.agent_id) || []
    const members = isMember
      ? current.filter(id => id !== agentId)
      : [...current, agentId]

    await fetch('/api/groups', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: groupId, members }),
    })
    await load()
    const updated = groups.find(g => g.id === groupId)
    if (updated) setSelected(updated)
  }

  async function toggleVoicemail(group: GroupWithMembers) {
    await fetch('/api/groups', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: group.id, voicemail_enabled: !group.voicemail_enabled }),
    })
    await load()
  }

  if (loading) return <p className="text-gray-400 p-6">Loading...</p>

  return (
    <div className="flex gap-6 h-full">
      {/* Groups list */}
      <div className="w-64 shrink-0 space-y-2">
        <p className="text-gray-400 text-xs uppercase tracking-widest mb-3">Inbound Groups</p>

        {groups.map(g => (
          <button
            key={g.id}
            onClick={() => setSelected(g)}
            className={`w-full text-left px-3 py-3 rounded-lg border transition-colors ${
              selected?.id === g.id
                ? 'bg-blue-900/40 border-blue-600 text-white'
                : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
            }`}
          >
            <p className="font-medium text-sm">{g.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {g.phone_number || 'No number assigned'} · {g.inbound_group_members?.length || 0} agents
            </p>
          </button>
        ))}

        {/* Create group */}
        <div className="border-t border-gray-700 pt-3 mt-3 space-y-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Group name"
            className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
          />
          <input
            value={newPhone}
            onChange={e => setNewPhone(e.target.value)}
            placeholder="+1 DID number"
            className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
          />
          <button
            onClick={createGroup}
            disabled={!newName.trim() || creating}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Group
          </button>
        </div>
      </div>

      {/* Group detail */}
      {selected ? (
        <div className="flex-1 bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-white text-lg font-semibold">{selected.name}</h2>
              <p className="text-gray-400 text-sm">{selected.phone_number || 'No phone number'}</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.voicemail_enabled}
                  onChange={() => toggleVoicemail(selected)}
                  className="accent-blue-500"
                />
                Voicemail
              </label>
              <button
                onClick={() => deleteGroup(selected.id)}
                className="text-red-400 hover:text-red-300 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-gray-400" />
            <p className="text-gray-300 text-sm font-medium">Agents</p>
          </div>

          <div className="space-y-2">
            {agents.map(agent => {
              const isMember = selected.inbound_group_members?.some(m => m.agent_id === agent.id)
              return (
                <label
                  key={agent.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                    isMember ? 'border-blue-600 bg-blue-900/20' : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!isMember}
                    onChange={() => toggleMember(selected.id, agent.id, !!isMember)}
                    className="accent-blue-500"
                  />
                  <div>
                    <p className="text-white text-sm font-medium">{agent.name}</p>
                    <p className="text-gray-500 text-xs">{agent.email}</p>
                  </div>
                </label>
              )
            })}
            {agents.length === 0 && (
              <p className="text-gray-500 text-sm">No agents yet. Add them in the Agents section.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-600">
          <p>Select a group to manage members</p>
        </div>
      )}
    </div>
  )
}
