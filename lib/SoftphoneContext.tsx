'use client'

import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Agent } from './types'

type CallState = 'idle' | 'ringing' | 'active' | 'held'
type RingType = 'inbound' | 'outbound' | 'group-inbound'

interface ActiveCall {
  id: string
  direction: 'inbound' | 'outbound'
  remoteNumber: string
  groupName?: string
  state: CallState
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  telnyxCall: any
}

interface SoftphoneContextValue {
  agent: Agent | null
  setAgent: (agent: Agent | null) => void
  agentLoading: boolean
  connected: boolean
  activeCall: ActiveCall | null
  makeCall: (number: string) => void
  answerCall: () => void
  hangupCall: () => void
  toggleHold: () => void
  toggleMute: () => void
  muted: boolean
}

const SoftphoneContext = createContext<SoftphoneContextValue | null>(null)

export function SoftphoneProvider({ children }: { children: React.ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null)
  const [agentLoading, setAgentLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null)
  const [muted, setMuted] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientRef = useRef<any>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const groupsRef = useRef<Array<{ id: string; name: string; phone_number: string }>>([])

  useEffect(() => {
    if (!agent) return
    fetch('/api/groups')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) groupsRef.current = data })
      .catch(() => {})
  }, [agent?.id])

  function startRing(type: RingType) {
    stopRing()
    if (typeof window === 'undefined') return
    const ctx = new AudioContext()
    audioCtxRef.current = ctx

    function tone(freqs: number[], duration: number) {
      const gain = ctx.createGain()
      gain.gain.value = 0.12
      gain.connect(ctx.destination)
      freqs.forEach(freq => {
        const osc = ctx.createOscillator()
        osc.frequency.value = freq
        osc.connect(gain)
        osc.start()
        osc.stop(ctx.currentTime + duration)
      })
    }

    function beep() {
      if (type === 'outbound') {
        tone([440, 480], 2)
        ringTimerRef.current = setTimeout(beep, 6000)
      } else if (type === 'group-inbound') {
        // Double ring: ring–pause–ring–long pause, repeat
        tone([640, 720], 0.8)
        ringTimerRef.current = setTimeout(() => {
          tone([640, 720], 0.8)
          ringTimerRef.current = setTimeout(beep, 4000)
        }, 1400)
      } else {
        tone([480, 620], 2)
        ringTimerRef.current = setTimeout(beep, 6000)
      }
    }
    beep()
  }

  function stopRing() {
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Restore agent from localStorage on mount and sync status back to DB
    const stored = localStorage.getItem('dialer_agent')
    if (stored) {
      try {
        const a = JSON.parse(stored)
        setAgent(a)
        // DB status may be stale from a previous session — push it back
        if (a?.id && a?.status) {
          fetch('/api/agents', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: a.id, status: a.status }),
          }).catch(() => {})
        }
      } catch {}
    }
    setAgentLoading(false)
  }, [])

  useEffect(() => {
    if (!agent?.sip_username || !agent?.sip_password) return

    let isMounted = true

    async function initClient() {
      const { TelnyxRTC } = await import('@telnyx/webrtc')

      // Suppress a known Telnyx SDK timing warning that shows in the Next.js
      // dev overlay. The SDK logs this when a 180 Ringing SIP response arrives
      // before the call is fully registered in its internal map — harmless.
      const origError = console.error.bind(console)
      console.error = (...args: unknown[]) => {
        if (typeof args[0] === 'string' && args[0].includes('non existing call')) return
        origError(...args)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client: any = new TelnyxRTC({
        login: agent!.sip_username,
        password: agent!.sip_password,
      })

      client.on('telnyx.ready', () => {
        if (!isMounted) return
        setConnected(true)
        // Pre-acquire mic so it's ready when a call arrives, avoiding startup crackle
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => stream.getTracks().forEach(t => t.stop()))
          .catch(() => {})
      })

      client.on('telnyx.error', (err: unknown) => {
        console.error('Telnyx error', err)
      })

      client.on('telnyx.socket.close', () => {
        if (!isMounted) return
        setConnected(false)
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = setTimeout(() => {
          if (isMounted && clientRef.current) {
            clientRef.current.connect()
          }
        }, 3000)
      })

      client.on('telnyx.notification', (notification: { type: string; call: any }) => {
        if (!isMounted) return
        const { call } = notification
        if (notification.type === 'callUpdate') {
          if (call.state === 'ringing') {
            const callerName: string = call.options?.remoteCallerName || ''
            const groupName = callerName.startsWith('GROUP:') ? callerName.slice(6) : undefined
            setActiveCall({
              id: call.id,
              direction: 'inbound',
              remoteNumber: call.options?.remoteCallerNumber || 'Unknown',
              groupName,
              state: 'ringing',
              telnyxCall: call,
            })
            startRing(groupName ? 'group-inbound' : 'inbound')
          } else if (call.state === 'active') {
            stopRing()
            setActiveCall(prev => {
              // Attribute group call to this agent now that they've answered
              if (prev?.groupName && agent) {
                fetch('/api/calls', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'answer',
                    agentId: agent.id,
                    groupName: prev.groupName,
                    remoteNumber: prev.remoteNumber.replace(/\D/g, ''),
                  }),
                }).catch(() => {})
              }
              return prev ? { ...prev, state: 'active', telnyxCall: call } : null
            })
            if (call.remoteStream) {
              let audio = document.getElementById('telnyx-remote-audio') as HTMLAudioElement
              if (!audio) {
                audio = document.createElement('audio')
                audio.id = 'telnyx-remote-audio'
                audio.autoplay = true
                document.body.appendChild(audio)
              }
              audio.srcObject = call.remoteStream
              audio.play().catch(console.error)
            }
          } else if (call.state === 'hangup' || call.state === 'destroy') {
            stopRing()
            setActiveCall(null)
            setMuted(false)
            const audio = document.getElementById('telnyx-remote-audio') as HTMLAudioElement
            if (audio) { audio.srcObject = null; audio.remove() }
          } else if (call.state === 'held') {
            setActiveCall(prev => prev ? { ...prev, state: 'held', telnyxCall: call } : null)
          }
        }
      })

      await client.connect()
      clientRef.current = client
    }

    initClient().catch(console.error)

    return () => {
      isMounted = false
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null }
      if (clientRef.current) {
        clientRef.current.disconnect()
        clientRef.current = null
        setConnected(false)
        setActiveCall(null)
      }
    }
  }, [agent?.sip_username, agent?.sip_password])

  function makeCall(number: string) {
    if (!clientRef.current || !agent) return

    const call = clientRef.current.newCall({
      destinationNumber: number,
      callerNumber: agent.extension || agent.sip_username,
    })

    // Log outbound call with call control ID so call history and admin monitor work
    fetch('/api/calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_number: agent.extension || agent.sip_username,
        to_number: number,
        agent_id: agent.id,
        telnyx_call_control_id: call.id,
      }),
    }).catch(() => {})

    setActiveCall({
      id: call.id,
      direction: 'outbound',
      remoteNumber: number,
      state: 'ringing',
      telnyxCall: call,
    })
    startRing('outbound')
  }

  function answerCall() {
    if (!activeCall?.telnyxCall) return
    activeCall.telnyxCall.answer()
  }

  function hangupCall() {
    if (!activeCall?.telnyxCall) return
    activeCall.telnyxCall.hangup()
    stopRing()
    setActiveCall(null)
    setMuted(false)
  }

  function toggleHold() {
    if (!activeCall?.telnyxCall) return
    if (activeCall.state === 'held') {
      activeCall.telnyxCall.unhold()
    } else {
      activeCall.telnyxCall.hold()
    }
  }

  function toggleMute() {
    if (!activeCall?.telnyxCall) return
    if (muted) {
      activeCall.telnyxCall.unmuteAudio()
    } else {
      activeCall.telnyxCall.muteAudio()
    }
    setMuted(prev => !prev)
  }

  const handleSetAgent = (a: Agent | null) => {
    setAgent(a)
    if (a) {
      localStorage.setItem('dialer_agent', JSON.stringify(a))
    } else {
      localStorage.removeItem('dialer_agent')
    }
  }

  return (
    <SoftphoneContext.Provider
      value={{ agent, setAgent: handleSetAgent, agentLoading, connected, activeCall, makeCall, answerCall, hangupCall, toggleHold, toggleMute, muted }}
    >
      {children}
    </SoftphoneContext.Provider>
  )
}

export function useSoftphone() {
  const ctx = useContext(SoftphoneContext)
  if (!ctx) throw new Error('useSoftphone must be used within SoftphoneProvider')
  return ctx
}
