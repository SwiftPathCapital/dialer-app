'use client'

import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Agent } from './types'

type CallState = 'idle' | 'ringing' | 'active' | 'held'

interface ActiveCall {
  id: string
  direction: 'inbound' | 'outbound'
  remoteNumber: string
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

  function startRing(type: 'inbound' | 'outbound') {
    stopRing()
    if (typeof window === 'undefined') return
    const ctx = new AudioContext()
    audioCtxRef.current = ctx

    function beep() {
      const gain = ctx.createGain()
      gain.gain.value = 0.12
      gain.connect(ctx.destination)

      if (type === 'outbound') {
        // US ringback: 440Hz + 480Hz
        ;[440, 480].forEach(freq => {
          const osc = ctx.createOscillator()
          osc.frequency.value = freq
          osc.connect(gain)
          osc.start()
          osc.stop(ctx.currentTime + 2)
        })
      } else {
        // Inbound: two-tone ring (480Hz + 620Hz)
        ;[480, 620].forEach(freq => {
          const osc = ctx.createOscillator()
          osc.frequency.value = freq
          osc.connect(gain)
          osc.start()
          osc.stop(ctx.currentTime + 2)
        })
      }
      ringTimerRef.current = setTimeout(beep, 6000)
    }
    beep()
  }

  function stopRing() {
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Restore agent from localStorage on mount
    const stored = localStorage.getItem('dialer_agent')
    if (stored) {
      try {
        setAgent(JSON.parse(stored))
      } catch {}
    }
    setAgentLoading(false)
  }, [])

  useEffect(() => {
    if (!agent?.sip_username || !agent?.sip_password) return

    let isMounted = true

    async function initClient() {
      const { TelnyxRTC } = await import('@telnyx/webrtc')
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

      client.on('telnyx.notification', (notification: { type: string; call: any }) => {
        if (!isMounted) return
        const { call } = notification
        if (notification.type === 'callUpdate') {
          if (call.state === 'ringing') {
            setActiveCall({
              id: call.id,
              direction: 'inbound',
              remoteNumber: call.options?.remoteCallerNumber || 'Unknown',
              state: 'ringing',
              telnyxCall: call,
            })
            startRing('inbound')
          } else if (call.state === 'active') {
            stopRing()
            setActiveCall(prev => prev ? { ...prev, state: 'active', telnyxCall: call } : null)
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
