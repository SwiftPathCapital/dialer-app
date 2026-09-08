'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Upload, Shapes, Save, Pencil, CheckCircle } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import { MoistureProject, MoistureReadingPoint, MoistureShape } from '@/lib/types'
import FloorPlanCanvas from '@/components/moisture/FloorPlanCanvas'
import ShapeComposer from '@/components/moisture/ShapeComposer'
import ReadingPanel from '@/components/moisture/ReadingPanel'

type ProjectDetail = MoistureProject & { points: MoistureReadingPoint[] }

function contactName(lead?: MoistureProject['lead']) {
  if (!lead) return 'Unknown contact'
  return lead.company_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || 'Unknown contact'
}

export default function MoistureProjectPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const projectId = params.id

  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingLayout, setEditingLayout] = useState(false)
  const [draftShapes, setDraftShapes] = useState<MoistureShape[]>([])
  const [savingLayout, setSavingLayout] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedPoint, setSelectedPoint] = useState<MoistureReadingPoint | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    fetch(`/api/moisture/projects/${projectId}`)
      .then(r => r.json())
      .then((d: ProjectDetail) => {
        setProject(d)
        setLoading(false)
        if (d.floor_plan_type === 'drawn' && (d.floor_plan_shapes ?? []).length === 0) {
          setDraftShapes([])
          setEditingLayout(true)
        }
      })
      .catch(() => setLoading(false))
  }, [projectId])

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    load()
  }, [agent, agentLoading, router, load])

  async function chooseDrawn() {
    const res = await fetch(`/api/moisture/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ floor_plan_type: 'drawn', floor_plan_shapes: [] }),
    })
    const data = await res.json()
    setProject(prev => (prev ? { ...prev, ...data } : prev))
    setDraftShapes([])
    setEditingLayout(true)
  }

  async function uploadImage(file: File) {
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/api/moisture/projects/${projectId}/upload`, { method: 'POST', body: formData })
    const data = await res.json()
    setUploading(false)
    if (res.ok) setProject(prev => (prev ? { ...prev, ...data } : prev))
  }

  async function saveLayout() {
    setSavingLayout(true)
    const res = await fetch(`/api/moisture/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ floor_plan_shapes: draftShapes }),
    })
    const data = await res.json()
    setSavingLayout(false)
    if (res.ok) {
      setProject(prev => (prev ? { ...prev, ...data } : prev))
      setEditingLayout(false)
    }
  }

  function startEditingLayout() {
    setDraftShapes(project?.floor_plan_shapes ?? [])
    setEditingLayout(true)
  }

  async function addPoint(x: number, y: number) {
    if (!project) return
    const res = await fetch('/api/moisture/points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: project.id, x, y, label: `Point ${project.points.length + 1}` }),
    })
    const point: MoistureReadingPoint = await res.json()
    if (res.ok) {
      setProject(prev => (prev ? { ...prev, points: [...prev.points, point] } : prev))
      setSelectedPoint(point)
    }
  }

  async function toggleStatus() {
    if (!project) return
    const nextStatus = project.status === 'completed' ? 'in_progress' : 'completed'
    const res = await fetch(`/api/moisture/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    })
    const data = await res.json()
    if (res.ok) setProject(prev => (prev ? { ...prev, ...data } : prev))
  }

  if (!agent || loading) return null
  if (!project) return <div className="p-6 text-gray-500 text-sm">Project not found.</div>

  return (
    <div className="p-6 max-w-2xl">
      <button onClick={() => router.push('/moisture-mapping')} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Moisture Mapping
      </button>

      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{project.name}</h1>
          <p className="text-gray-400 text-sm mt-0.5">{contactName(project.lead)}</p>
        </div>
        <button
          onClick={toggleStatus}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors ${
            project.status === 'completed' ? 'bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/60' : 'bg-blue-900/40 text-blue-300 hover:bg-blue-900/60'
          }`}
        >
          <CheckCircle className="w-3.5 h-3.5" />
          {project.status === 'completed' ? 'Completed' : 'Mark Completed'}
        </button>
      </div>

      {!project.floor_plan_type ? (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center">
          <p className="text-white font-medium mb-1">Choose how to set up the floor plan</p>
          <p className="text-gray-500 text-sm mb-6">You can upload a scan of an existing plan, or build a simple layout with drag-and-drop shapes.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" /> {uploading ? 'Uploading…' : 'Upload Floor Plan'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }}
            />
            <button
              onClick={chooseDrawn}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Shapes className="w-4 h-4" /> Draw Floor Plan
            </button>
          </div>
        </div>
      ) : editingLayout ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-sm">Building Layout</h2>
            <button
              onClick={saveLayout}
              disabled={savingLayout}
              className="neon-pulse flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
              style={{ '--glow-color': '#22d3ee' } as React.CSSProperties}
            >
              <Save className="w-3.5 h-3.5" /> {savingLayout ? 'Saving…' : 'Save & Start Mapping'}
            </button>
          </div>
          <ShapeComposer shapes={draftShapes} onChange={setDraftShapes} />
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-sm">Moisture Readings</h2>
            {project.floor_plan_type === 'drawn' && (
              <button
                onClick={startEditingLayout}
                className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit Layout
              </button>
            )}
          </div>
          <FloorPlanCanvas
            imageUrl={project.floor_plan_type === 'image' ? project.floor_plan_image_url : undefined}
            shapes={project.floor_plan_shapes}
            points={project.points}
            onCanvasTap={addPoint}
            onPointTap={setSelectedPoint}
          />
          <p className="text-gray-500 text-xs mt-2">Tap the floor plan to add a new reading point, or tap an existing pin to view its history.</p>
        </div>
      )}

      {selectedPoint && agent && (
        <ReadingPanel
          point={selectedPoint}
          agentId={agent.id}
          onClose={() => setSelectedPoint(null)}
          onReadingAdded={load}
        />
      )}
    </div>
  )
}
