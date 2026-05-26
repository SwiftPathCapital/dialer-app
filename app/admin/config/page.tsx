'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Save, CheckCircle, XCircle, RefreshCw, Upload, Mic, Filter } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

type Agent = { id: string; name: string; voicemail_greeting_url: string | null }

type ConfigStatus = Record<string, { isSet: boolean; updated_at: string | null }>

const SECTIONS = [
  {
    title: 'Telnyx',
    description: 'Connect your Telnyx account for voice and SMS. Find these in the Telnyx Portal.',
    fields: [
      {
        key: 'telnyx_api_key',
        label: 'API Key',
        description: 'From Telnyx Portal → Account → Keys & Credentials. Starts with "KEY..."',
        sensitive: true,
        placeholder: 'KEY...',
      },
      {
        key: 'telnyx_public_key',
        label: 'Public Key',
        description: 'Used to verify incoming webhook signatures. Found in API Keys page.',
        sensitive: true,
        placeholder: 'phk_...',
      },
      {
        key: 'telnyx_sip_connection_id',
        label: 'SIP Connection ID',
        description: 'From Telnyx Portal → Voice → SIP Connections. Required for agent softphones.',
        sensitive: false,
        placeholder: '1234567890123456789',
      },
    ],
  },
  {
    title: 'Application',
    description: 'General settings for this dialer deployment.',
    fields: [
      {
        key: 'app_url',
        label: 'App URL',
        description: 'The public URL of this dialer (e.g. https://dialer.yourapp.up.railway.app). Used for Telnyx webhook callbacks.',
        sensitive: false,
        placeholder: 'https://your-dialer.up.railway.app',
      },
    ],
  },
]

export default function ConfigPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()

  const [status, setStatus] = useState<ConfigStatus>({})
  const [values, setValues] = useState<Record<string, string>>({})
  const [show, setShow] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState<Agent[]>([])
  const [greetingUploading, setGreetingUploading] = useState<Record<string, boolean>>({})
  const [greetingSaved, setGreetingSaved] = useState<Record<string, boolean>>({})
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const [leadSourceTypes, setLeadSourceTypes] = useState<string[]>([])
  const [activeSources, setActiveSources] = useState<string[]>([])
  const [sourcesSaving, setSourcesSaving] = useState(false)
  const [sourcesSaved, setSourcesSaved] = useState(false)

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    loadStatus()
    fetch('/api/agents').then(r => r.json()).then(data => { if (Array.isArray(data)) setAgents(data) }).catch(() => {})
    fetch('/api/admin/lead-sources').then(r => r.json()).then(d => {
      if (Array.isArray(d.types)) setLeadSourceTypes(d.types)
      if (Array.isArray(d.active)) setActiveSources(d.active)
    }).catch(() => {})
  }, [agent, agentLoading, router])

  async function loadStatus() {
    setLoading(true)
    const res = await fetch('/api/config')
    const data = await res.json()
    setStatus(data)
    setLoading(false)
  }

  function set(key: string, value: string) {
    setValues(prev => ({ ...prev, [key]: value }))
    setSaved(prev => ({ ...prev, [key]: false }))
  }

  function toggleSource(type: string) {
    setActiveSources(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
    setSourcesSaved(false)
  }

  async function saveLeadSources() {
    setSourcesSaving(true)
    await fetch('/api/admin/lead-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sources: activeSources }),
    })
    setSourcesSaving(false)
    setSourcesSaved(true)
    setTimeout(() => setSourcesSaved(false), 3000)
  }

  async function uploadGreeting(agentId: string, file: File) {
    setGreetingUploading(prev => ({ ...prev, [agentId]: true }))
    const form = new FormData()
    form.append('agentId', agentId)
    form.append('file', file)
    const res = await fetch('/api/voicemail/greeting', { method: 'POST', body: form })
    const data = await res.json()
    if (!res.ok) { alert(data.error || 'Upload failed'); setGreetingUploading(prev => ({ ...prev, [agentId]: false })); return }
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, voicemail_greeting_url: data.url } : a))
    setGreetingUploading(prev => ({ ...prev, [agentId]: false }))
    setGreetingSaved(prev => ({ ...prev, [agentId]: true }))
    setTimeout(() => setGreetingSaved(prev => ({ ...prev, [agentId]: false })), 3000)
  }

  async function saveSection(keys: string[]) {
    const sectionKey = keys.join(',')
    setSaving(prev => ({ ...prev, [sectionKey]: true }))

    const payload: Record<string, string> = {}
    for (const key of keys) {
      if (values[key] !== undefined && values[key] !== '') {
        payload[key] = values[key]
      }
    }

    if (Object.keys(payload).length > 0) {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    // Clear the input values and refresh status
    setValues(prev => {
      const next = { ...prev }
      keys.forEach(k => delete next[k])
      return next
    })

    await loadStatus()
    setSaving(prev => ({ ...prev, [sectionKey]: false }))
    setSaved(prev => ({ ...prev, [sectionKey]: true }))
    setTimeout(() => setSaved(prev => ({ ...prev, [sectionKey]: false })), 3000)
  }

  if (!agent) return null

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Configuration</h1>
          <p className="text-gray-400 text-sm mt-0.5">Manage API keys and integration settings</p>
        </div>
        <button
          onClick={loadStatus}
          className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-6">
          {[1, 2].map(i => (
            <div key={i} className="bg-gray-800 rounded-xl p-6 border border-gray-700 animate-pulse h-48" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {SECTIONS.map(section => {
            const sectionKey = section.fields.map(f => f.key).join(',')
            const isSaving = saving[sectionKey]
            const isSaved = saved[sectionKey]
            const hasChanges = section.fields.some(f => values[f.key] !== undefined && values[f.key] !== '')

            return (
              <div key={section.title} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                {/* Section header */}
                <div className="px-6 py-4 border-b border-gray-700">
                  <h2 className="text-white font-semibold">{section.title}</h2>
                  <p className="text-gray-400 text-sm mt-0.5">{section.description}</p>
                </div>

                {/* Fields */}
                <div className="divide-y divide-gray-700">
                  {section.fields.map(field => {
                    const info = status[field.key]
                    const isSet = info?.isSet
                    const inputVal = values[field.key] ?? ''

                    return (
                      <div key={field.key} className="px-6 py-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <label className="text-white text-sm font-medium">{field.label}</label>
                              {isSet ? (
                                <span className="flex items-center gap-1 text-xs text-green-400">
                                  <CheckCircle className="w-3 h-3" /> Set
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                  <XCircle className="w-3 h-3" /> Not set
                                </span>
                              )}
                            </div>
                            <p className="text-gray-500 text-xs mt-0.5 max-w-md">{field.description}</p>
                          </div>
                          {info?.updated_at && (
                            <span className="text-gray-600 text-xs shrink-0 ml-4">
                              Updated {new Date(info.updated_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>

                        <div className="relative mt-2">
                          <input
                            type={field.sensitive && !show[field.key] ? 'password' : 'text'}
                            value={inputVal}
                            onChange={e => set(field.key, e.target.value)}
                            placeholder={isSet ? '••••••••  (leave blank to keep current)' : field.placeholder}
                            className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600 pr-10"
                          />
                          {field.sensitive && (
                            <button
                              type="button"
                              onClick={() => setShow(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                            >
                              {show[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Save button */}
                <div className="px-6 py-4 bg-gray-900/30 flex items-center justify-between">
                  <span className={`text-sm transition-all ${isSaved ? 'text-green-400' : 'text-transparent'}`}>
                    Saved successfully
                  </span>
                  <button
                    onClick={() => saveSection(section.fields.map(f => f.key))}
                    disabled={isSaving || !hasChanges}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {isSaving ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Saving...</>
                    ) : (
                      <><Save className="w-4 h-4" /> Save {section.title}</>
                    )}
                  </button>
                </div>
              </div>
            )
          })}

          {/* Dialer Lead Sources */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700">
              <h2 className="text-white font-semibold flex items-center gap-2"><Filter className="w-4 h-4" /> Dialer Lead Sources</h2>
              <p className="text-gray-400 text-sm mt-0.5">Only leads from checked sources will appear in the agent dialer queue. Uncheck a source to stop agents from seeing those leads.</p>
            </div>
            <div className="px-6 py-5">
              {leadSourceTypes.length === 0 ? (
                <p className="text-gray-500 text-sm">No lead sources found in the database.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {leadSourceTypes.map(type => {
                    const on = activeSources.includes(type)
                    return (
                      <button
                        key={type}
                        onClick={() => toggleSource(type)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          on
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
                        }`}
                      >
                        {type}
                        {on && <span className="ml-2 text-blue-300 text-xs">✓</span>}
                      </button>
                    )
                  })}
                </div>
              )}
              {activeSources.length === 0 && leadSourceTypes.length > 0 && (
                <p className="text-yellow-500 text-xs mt-3">⚠ No sources selected — all leads will be shown.</p>
              )}
            </div>
            <div className="px-6 py-4 bg-gray-900/30 flex items-center justify-between">
              <span className={`text-sm transition-all ${sourcesSaved ? 'text-green-400' : 'text-transparent'}`}>
                Saved successfully
              </span>
              <button
                onClick={saveLeadSources}
                disabled={sourcesSaving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {sourcesSaving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Sources</>}
              </button>
            </div>
          </div>

          {/* Voicemail Greetings */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700">
              <h2 className="text-white font-semibold flex items-center gap-2"><Mic className="w-4 h-4" /> Voicemail Greetings</h2>
              <p className="text-gray-400 text-sm mt-0.5">Upload a custom greeting (MP3 or WAV) played before the beep. Max 10 MB.</p>
            </div>
            <div className="divide-y divide-gray-700">
              {agents.map(a => (
                <div key={a.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-white text-sm font-medium">{a.name}</p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {a.voicemail_greeting_url ? 'Custom greeting set' : 'Using default TTS greeting'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {greetingSaved[a.id] && <span className="text-green-400 text-xs flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Saved</span>}
                    {a.voicemail_greeting_url && (
                      <audio controls src={a.voicemail_greeting_url} className="h-8 w-40" />
                    )}
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg"
                      className="hidden"
                      ref={el => { fileInputRefs.current[a.id] = el }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadGreeting(a.id, f) }}
                    />
                    <button
                      onClick={() => fileInputRefs.current[a.id]?.click()}
                      disabled={greetingUploading[a.id]}
                      className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs rounded-lg transition-colors"
                    >
                      {greetingUploading[a.id] ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                      {a.voicemail_greeting_url ? 'Replace' : 'Upload'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info box about Supabase */}
          <div className="bg-blue-950/40 border border-blue-800/50 rounded-xl p-5">
            <p className="text-blue-300 text-sm font-medium mb-1">Supabase credentials</p>
            <p className="text-blue-400/70 text-xs">
              Supabase URL and keys must be set as environment variables on your Railway deployment
              (or in <code className="bg-blue-900/40 px-1 rounded">.env.local</code> for local dev)
              because they're needed before the app can start. Once those are set, all other settings
              above are stored securely in your Supabase database.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
