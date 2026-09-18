'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSoftphone } from '@/lib/SoftphoneContext'
import {
  ReactFlow, Background, Controls, addEdge,
  useNodesState, useEdgesState, Handle, Position,
  type Node, type Edge, type Connection, type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Plus, Trash2, MessageSquare, Tag as TagIcon, CalendarClock, Zap, ArrowLeft, Pencil } from 'lucide-react'

const DISPOSITIONS = [
  'Interested', 'Callback', 'App Received', 'Docs Received', 'Pending App & Docs',
  'Deal Funded', 'Not Interested', 'No Answer', 'Left Voicemail', 'Wrong Number', 'DNC',
]

const TRIGGER_ID = 'trigger'

const OFFSET_OPTIONS = [
  { label: 'Immediately', minutes: 0 },
  { label: '15 minutes', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '1 day', minutes: 1440 },
  { label: '3 days', minutes: 4320 },
  { label: '1 week', minutes: 10080 },
]

const EVENT_TYPES = ['callback', 'in_person', 'discovery', 'meeting', 'task']

type ActionKind = 'sms' | 'tag' | 'callback'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function offsetLabel(minutes: any) {
  const found = OFFSET_OPTIONS.find(o => o.minutes === minutes)
  return found ? found.label : `${minutes}m`
}

const ACTION_META: Record<ActionKind, {
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  color: string
  border: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summary: (data: any) => string
}> = {
  sms: {
    label: 'Send SMS', icon: MessageSquare, color: 'text-blue-400', border: 'border-blue-700/60',
    summary: d => d.message?.trim() ? d.message : 'No message set',
  },
  tag: {
    label: 'Add Tag', icon: TagIcon, color: 'text-purple-400', border: 'border-purple-700/60',
    summary: d => d.tagName || 'No tag selected',
  },
  callback: {
    label: 'Create Callback', icon: CalendarClock, color: 'text-amber-400', border: 'border-amber-700/60',
    summary: d => d.offsetMinutes != null ? offsetLabel(d.offsetMinutes) : 'No timing set',
  },
}

function defaultsForKind(kind: ActionKind) {
  if (kind === 'sms') return { message: '' }
  if (kind === 'tag') return { tagId: '', tagName: '' }
  return { offsetMinutes: 60, notes: '', eventType: 'callback' }
}

interface NodeData extends Record<string, unknown> {
  kind?: ActionKind
  message?: string
  tagId?: string
  tagName?: string
  offsetMinutes?: number
  notes?: string
  eventType?: string
}

function TriggerNode() {
  return (
    <div className="px-4 py-3 rounded-xl border-2 border-cyan-600 bg-cyan-950/60 min-w-[160px]">
      <div className="flex items-center gap-2 text-cyan-300 text-xs font-semibold uppercase tracking-widest">
        <Zap className="w-3.5 h-3.5" /> Disposition
      </div>
      <Handle type="source" position={Position.Right} className="!bg-cyan-500" />
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ActionNode({ data, selected }: { data: any; selected: boolean }) {
  const meta = ACTION_META[data.kind as ActionKind]
  const Icon = meta.icon
  return (
    <div className={`px-4 py-3 rounded-xl border-2 bg-gray-800 min-w-[190px] max-w-[220px] ${selected ? 'border-white' : meta.border}`}>
      <Handle type="target" position={Position.Left} className="!bg-gray-500" />
      <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-widest mb-1 ${meta.color}`}>
        <Icon className="w-3.5 h-3.5" /> {meta.label}
      </div>
      <p className="text-gray-300 text-xs truncate">{meta.summary(data)}</p>
    </div>
  )
}

const nodeTypes = { trigger: TriggerNode, action: ActionNode }

interface WorkflowRow {
  id: string
  name: string
  trigger_dispositions: string[]
  enabled: boolean
  nodes: Node[]
  edges: Edge[]
}

interface TagOption { id: string; name: string; color: string }

function defaultNodes(): Node<NodeData>[] {
  return [{ id: TRIGGER_ID, type: 'trigger', position: { x: 40, y: 140 }, data: {} }]
}

interface EditorProps {
  workflow: WorkflowRow | null
  tags: TagOption[]
  agentId: string
  onBack: () => void
  onSaved: () => void
}

function WorkflowEditor({ workflow, tags, agentId, onBack, onSaved }: EditorProps) {
  const [name, setName] = useState(workflow?.name || '')
  const [dispositions, setDispositions] = useState<string[]>(workflow?.trigger_dispositions || [])
  const [enabled, setEnabled] = useState(workflow?.enabled ?? true)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>(workflow?.nodes?.length ? (workflow.nodes as Node<NodeData>[]) : defaultNodes())
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(workflow?.edges || [])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const flowInstance = useRef<ReactFlowInstance | null>(null)

  const selectedNode = nodes.find(n => n.id === selectedNodeId)

  function toggleDisposition(d: string) {
    setDispositions(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  function addAction(kind: ActionKind) {
    const actionCount = nodes.filter(n => n.type === 'action').length
    const id = `action-${Date.now()}`
    const newNode: Node<NodeData> = {
      id, type: 'action',
      position: { x: 400, y: 40 + actionCount * 130 },
      data: { kind, ...defaultsForKind(kind) },
    }
    setNodes(prev => [...prev, newNode])
    setEdges(prev => [...prev, { id: `e-${TRIGGER_ID}-${id}`, source: TRIGGER_ID, target: id }])
    setSelectedNodeId(id)
    // New nodes land outside the initial fitView unless we re-fit after the state flushes
    setTimeout(() => flowInstance.current?.fitView({ padding: 0.3, duration: 200 }), 50)
  }

  function updateSelectedData(patch: Partial<NodeData>) {
    if (!selectedNodeId) return
    setNodes(prev => prev.map(n => n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n))
  }

  function deleteSelected() {
    if (!selectedNodeId || selectedNodeId === TRIGGER_ID) return
    setNodes(prev => prev.filter(n => n.id !== selectedNodeId))
    setEdges(prev => prev.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId))
    setSelectedNodeId(null)
  }

  function onConnect(connection: Connection) {
    // v1 only supports trigger -> action edges, no action chaining/branching
    if (connection.source !== TRIGGER_ID) return
    setEdges(prev => addEdge(connection, prev))
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const payload = {
      name: name.trim(),
      agent_id: agentId,
      trigger_dispositions: dispositions,
      enabled,
      nodes: nodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
      edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
    }
    if (workflow?.id) {
      await fetch('/api/admin/workflows', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: workflow.id, ...payload }),
      })
    } else {
      await fetch('/api/admin/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Workflow name…"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600"
        />
        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer shrink-0">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="w-3.5 h-3.5 rounded accent-cyan-500" />
          Enabled
        </label>
        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="mb-4">
        <p className="text-gray-500 text-xs uppercase tracking-widest mb-2">Triggers when a call is dispositioned as</p>
        <div className="flex flex-wrap gap-2">
          {DISPOSITIONS.map(d => (
            <button
              key={d}
              onClick={() => toggleDisposition(d)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                dispositions.includes(d) ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => addAction('sms')} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-blue-400 text-xs rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> SMS
        </button>
        <button onClick={() => addAction('tag')} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-purple-400 text-xs rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> Tag
        </button>
        <button onClick={() => addAction('callback')} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-amber-400 text-xs rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> Callback
        </button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 h-[500px] bg-gray-950 rounded-xl border border-gray-800 overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.type === 'action' ? node.id : null)}
            onPaneClick={() => setSelectedNodeId(null)}
            onInit={inst => { flowInstance.current = inst }}
            nodeTypes={nodeTypes}
            fitView
            colorMode="dark"
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {selectedNode && (
          <div className="w-72 shrink-0 bg-gray-800 border border-gray-700 rounded-xl p-4 h-fit">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white text-sm font-semibold flex items-center gap-1.5">
                <Pencil className="w-3.5 h-3.5" /> {ACTION_META[selectedNode.data.kind as ActionKind].label}
              </p>
              <button onClick={deleteSelected} className="text-gray-500 hover:text-red-400 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {selectedNode.data.kind === 'sms' && (
              <div>
                <textarea
                  value={selectedNode.data.message}
                  onChange={e => updateSelectedData({ message: e.target.value })}
                  placeholder="Hi {{lead_name}}, this is {{agent_name}}…"
                  rows={5}
                  className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600 resize-none"
                />
                <p className="text-gray-600 text-[10px] mt-1.5">Placeholders: {'{{lead_name}}'}, {'{{agent_name}}'}</p>
              </div>
            )}

            {selectedNode.data.kind === 'tag' && (
              <select
                value={selectedNode.data.tagId}
                onChange={e => {
                  const tag = tags.find(t => t.id === e.target.value)
                  updateSelectedData({ tagId: e.target.value, tagName: tag?.name || '' })
                }}
                className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="">Select a tag…</option>
                {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}

            {selectedNode.data.kind === 'callback' && (
              <div className="space-y-3">
                <div>
                  <label className="text-gray-500 text-[10px] uppercase tracking-widest block mb-1">Schedule for</label>
                  <select
                    value={selectedNode.data.offsetMinutes}
                    onChange={e => updateSelectedData({ offsetMinutes: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    {OFFSET_OPTIONS.map(o => <option key={o.minutes} value={o.minutes}>{o.label} after disposition</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-gray-500 text-[10px] uppercase tracking-widest block mb-1">Event type</label>
                  <select
                    value={selectedNode.data.eventType}
                    onChange={e => updateSelectedData({ eventType: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-gray-500 text-[10px] uppercase tracking-widest block mb-1">Notes</label>
                  <textarea
                    value={selectedNode.data.notes}
                    onChange={e => updateSelectedData({ notes: e.target.value })}
                    rows={3}
                    className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function WorkflowsPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()

  const [workflows, setWorkflows] = useState<WorkflowRow[]>([])
  const [tags, setTags] = useState<TagOption[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<WorkflowRow | null | 'new'>(null)

  const load = useCallback(() => {
    if (!agent) return
    Promise.all([
      fetch(`/api/admin/workflows?agent_id=${agent.id}`).then(r => r.json()),
      fetch(`/api/admin/tags?agent_id=${agent.id}`).then(r => r.json()),
    ]).then(([wfs, tgs]) => {
      setWorkflows(Array.isArray(wfs) ? wfs : [])
      setTags(Array.isArray(tgs) ? tgs : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [agent])

  useEffect(() => {
    if (agentLoading) return
    if (!agent || agent.role !== 'admin') { router.push('/dashboard'); return }
    load()
  }, [agent, agentLoading, router, load])

  async function toggleEnabled(id: string, current: boolean) {
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, enabled: !current } : w))
    await fetch('/api/admin/workflows', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled: !current }),
    })
  }

  async function deleteWorkflow(id: string) {
    if (!confirm('Delete this workflow?')) return
    await fetch(`/api/admin/workflows?id=${id}`, { method: 'DELETE' })
    load()
  }

  if (!agent) return null

  if (editing) {
    return (
      <WorkflowEditor
        workflow={editing === 'new' ? null : editing}
        tags={tags}
        agentId={agent.id}
        onBack={() => setEditing(null)}
        onSaved={() => { setEditing(null); load() }}
      />
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Workflows</h1>
          <p className="text-gray-400 text-sm mt-0.5">Automatically send a text, add a tag, or schedule a callback when a call gets a certain disposition.</p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New Workflow
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : workflows.length === 0 ? (
        <p className="text-gray-600 text-sm">No workflows yet — create one above.</p>
      ) : (
        <div className="space-y-2">
          {workflows.map(wf => (
            <div key={wf.id} className="flex items-center gap-3 bg-gray-800 rounded-xl border border-gray-700 px-4 py-3">
              <label className="shrink-0" title={wf.enabled ? 'Enabled' : 'Disabled'}>
                <input
                  type="checkbox"
                  checked={wf.enabled}
                  onChange={() => toggleEnabled(wf.id, wf.enabled)}
                  className="w-4 h-4 rounded accent-cyan-500"
                />
              </label>
              <button onClick={() => setEditing(wf)} className="flex-1 min-w-0 text-left">
                <p className="text-white text-sm font-medium truncate">{wf.name}</p>
                <p className="text-gray-500 text-xs truncate">
                  {wf.trigger_dispositions.length ? wf.trigger_dispositions.join(', ') : 'No trigger dispositions set'}
                </p>
              </button>
              <button onClick={() => deleteWorkflow(wf.id)} className="text-gray-600 hover:text-red-400 transition-colors shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
