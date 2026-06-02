'use client'

import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Agent, AgentStatus } from './types'
import { supabase } from './supabase'

type CallState = 'idle' | 'ringing' | 'active' | 'held'
type RingType = 'inbound' | 'outbound' | 'group-inbound'

export interface ActiveCall {
  id: string
  direction: 'inbound' | 'outbound'
  remoteNumber: string
  groupName?: string
  groupId?: string        // set when group call — used for the DB answer attribution
  groupColor?: string
  callerName?: string
  state: CallState
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  telnyxCall: any
}

type ConferenceStatus = 'idle' | 'dialing' | 'active'

interface SoftphoneContextValue {
  agent: Agent | null
  setAgent: (agent: Agent | null) => void
  agentLoading: boolean
  connected: boolean
  activeCall: ActiveCall | null
  waitingCall: ActiveCall | null   // inbound ringing while already on a call
  heldCall: ActiveCall | null     // the call we placed on hold to answer waitingCall
  /** Initiates an outbound call. Returns true if the dial proceeded, false if blocked (e.g. cooldown). */
  makeCall: (number: string, opts?: { bypassCooldown?: boolean }) => Promise<boolean>
  /** Holds the active call and dials a new number — used to add a third party. */
  addPartyCall: (number: string) => void
  /** Merges active + held calls into a Telnyx conference bridge. */
  mergeConference: () => Promise<void>
  conferenceStatus: ConferenceStatus
  answerCall: () => void
  hangupCall: () => void
  answerWaiting: () => void       // hold active, answer waiting
  rejectWaiting: () => void       // decline the waiting call
  resumeHeld: () => void          // manually resume held call (swap back)
  toggleHold: () => void
  toggleMute: () => void
  muted: boolean
  /** Set when makeCall is blocked (e.g. 8-hour cooldown). Auto-clears after 6 s. */
  callErrorMsg: string | null
  clearCallError: () => void
}

const SoftphoneContext = createContext<SoftphoneContextValue | null>(null)

export function SoftphoneProvider({ children }: { children: React.ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null)
  const [agentLoading, setAgentLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null)
  const [waitingCall, setWaitingCall] = useState<ActiveCall | null>(null)
  const [heldCall, setHeldCall] = useState<ActiveCall | null>(null)
  const [muted, setMuted] = useState(false)
  const [callErrorMsg, setCallErrorMsg] = useState<string | null>(null)
  const [conferenceStatus, setConferenceStatus] = useState<ConferenceStatus>('idle')
  const callErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const conferenceAudioCtxRef = useRef<AudioContext | null>(null)
  const inboundNotifRef = useRef<Notification | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientRef = useRef<any>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const ringGainRef = useRef<GainNode | null>(null)   // master gain — zeroed instantly on stopRing
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const groupsRef = useRef<Array<{ id: string; name: string; phone_number: string; color: string | null }>>([])
  const dialingRef = useRef(false)
  const prevCallRef = useRef<ActiveCall | null>(null)
  const callActiveAtRef = useRef<number | null>(null)
  const outboundCallIdRef = useRef<string | null>(null)

  // Refs that mirror state so Telnyx event-handler closures never see stale values.
  const activeCallRef = useRef<ActiveCall | null>(null)
  const waitingCallRef = useRef<ActiveCall | null>(null)
  const heldCallRef = useRef<ActiveCall | null>(null)

  // Status the agent had before any call started, so we can restore it afterwards.
  const preCallStatusRef = useRef<AgentStatus>('available')

  // ── Keep refs in sync with state ──────────────────────────────────────────
  useEffect(() => { activeCallRef.current = activeCall }, [activeCall])
  useEffect(() => { waitingCallRef.current = waitingCall }, [waitingCall])
  useEffect(() => { heldCallRef.current = heldCall }, [heldCall])

  // ── Ringing timeout: safety net for missed SIP CANCEL ─────────────────────
  // If an inbound call stays in 'ringing' for longer than the <Dial timeout="30"> + buffer,
  // it means Telnyx cancelled it (another agent answered) but the SDK didn't fire the event.
  useEffect(() => {
    if (activeCall?.state !== 'ringing' || activeCall.direction !== 'inbound') return
    const timer = setTimeout(() => {
      if (activeCallRef.current?.state === 'ringing') {
        stopRing()
        setActiveCall(null)
      }
    }, 35000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall?.id, activeCall?.state])

  // ── Load groups + clean up stale outbound rows on agent mount ─────────────
  useEffect(() => {
    if (!agent) return
    fetch('/api/groups')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) groupsRef.current = data })
      .catch(() => {})
    fetch('/api/calls', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cleanup', agentId: agent.id }),
    }).catch(() => {})
  }, [agent?.id])

  // ── End-of-call effect: tone + DB write + status restore ──────────────────
  useEffect(() => {
    const prev = prevCallRef.current
    prevCallRef.current = activeCall

    // Call just started — unlock dialing guard
    if (prev === null && activeCall !== null) {
      dialingRef.current = false
    }

    if (prev !== null && activeCall === null) {
      playHangupTone()
      setConferenceStatus('idle')
      tearDownConferenceAudio()

      // Restore agent status to whatever it was before any call started
      if (agent?.id) {
        const restoredStatus = preCallStatusRef.current
        fetch('/api/agents', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: agent.id, status: restoredStatus }),
        }).catch(() => {})
        setAgent(prev2 => prev2 ? { ...prev2, status: restoredStatus } : prev2)
      }

      // For outbound calls the TeXML status webhook never fires, so write duration from the browser.
      const activeAt = callActiveAtRef.current
      callActiveAtRef.current = null
      if (prev.direction === 'outbound') {
        const duration_seconds = activeAt ? Math.round((Date.now() - activeAt) / 1000) : null
        const status = activeAt ? 'completed' : 'no-answer'
        fetch('/api/calls', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'end', callControlId: prev.id, agentId: agent?.id, duration_seconds, status }),
        }).catch(() => {})
      }
    }
  }, [activeCall])

  // ── Restore localStorage agent on mount ───────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem('dialer_agent')
    const expiresAt = localStorage.getItem('dialer_agent_expires')
    if (stored) {
      try {
        const a = JSON.parse(stored)
        // Enforce 8-hour session expiry
        if (expiresAt && Date.now() > parseInt(expiresAt)) {
          localStorage.removeItem('dialer_agent')
          localStorage.removeItem('dialer_agent_expires')
          supabase.auth.signOut().catch(() => {})
          fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {})
        } else {
          setAgent(a)
          if (a?.id && a?.status) {
            fetch('/api/agents', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: a.id, status: a.status }),
            }).catch(() => {})
          }
        }
      } catch {}
    }
    setAgentLoading(false)
  }, [])

  // ── Telnyx WebRTC client ──────────────────────────────────────────────────
  useEffect(() => {
    if (!agent?.sip_username || !agent?.sip_password) return
    let isMounted = true

    async function initClient() {
      const { TelnyxRTC } = await import('@telnyx/webrtc')

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
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => stream.getTracks().forEach(t => t.stop()))
          .catch(() => {})
      })

      client.on('telnyx.error', (err: unknown) => { console.error('Telnyx error', err) })

      client.on('telnyx.socket.close', () => {
        if (!isMounted) return
        setConnected(false)
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = setTimeout(() => {
          if (isMounted && clientRef.current) clientRef.current.connect()
        }, 3000)
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.on('telnyx.notification', (notification: { type: string; call: any }) => {
        if (!isMounted) return
        const { call } = notification
        if (notification.type !== 'callUpdate') return

        // ── RINGING ──────────────────────────────────────────────────────────
        if (call.state === 'ringing') {
          // Outbound 180 Ringing — ignore
          if (outboundCallIdRef.current === call.id) return

          const callerName: string = call.options?.remoteCallerName || ''
          const groupName = callerName.startsWith('GROUP:') ? callerName.slice(6) : undefined
          const groupObj = groupName ? groupsRef.current.find(g => g.name === groupName) : undefined
          const remoteNumber: string = call.options?.remoteCallerNumber || 'Unknown'

          if (activeCallRef.current !== null) {
            // ── CALL WAITING ─────────────────────────────────────────────────
            // Already on a call — queue this as the waiting call instead of rejecting
            console.log('[Telnyx] call waiting:', call.id, 'from', remoteNumber)
            setWaitingCall({
              id: call.id,
              direction: 'inbound',
              remoteNumber,
              groupName,
              groupId: groupObj?.id,
              groupColor: groupObj?.color ?? undefined,
              state: 'ringing',
              telnyxCall: call,
            })
            playCallWaitingBeep()
            // Caller-ID lookup for waiting call
            const digits = remoteNumber.replace(/\D/g, '')
            if (digits) {
              fetch(`/api/caller-id?phone=${encodeURIComponent(digits)}`)
                .then(r => r.json())
                .then((d: { name?: string | null }) => {
                  if (d.name) setWaitingCall(prev => prev ? { ...prev, callerName: d.name! } : null)
                })
                .catch(() => {})
            }
            return
          }

          // ── NORMAL INBOUND RINGING ────────────────────────────────────────
          console.log('[Telnyx] ringing call.options:', JSON.stringify(call.options))
          console.log('[Telnyx] callerName:', callerName, '→ groupName:', groupName)
          setActiveCall({
            id: call.id,
            direction: 'inbound',
            remoteNumber,
            groupName,
            groupId: groupObj?.id,
            groupColor: groupObj?.color ?? undefined,
            state: 'ringing',
            telnyxCall: call,
          })
          startRing(groupName ? 'group-inbound' : 'inbound')

          const lookupDigits = remoteNumber.replace(/\D/g, '')
          if (lookupDigits) {
            fetch(`/api/caller-id?phone=${encodeURIComponent(lookupDigits)}`)
              .then(r => r.json())
              .then((d: { name?: string | null }) => {
                if (d.name) setActiveCall(prev => prev ? { ...prev, callerName: d.name! } : null)
              })
              .catch(() => {})
          }

          // Fallback: DB lookup if SIP header didn't carry GROUP: prefix
          if (!groupName) {
            const digits = remoteNumber.replace(/\D/g, '')
            if (digits) {
              ;(async () => {
                try {
                  const calls: { group_id?: string }[] = await fetch(
                    `/api/calls?from_number=${digits}&direction=inbound&status=ringing&limit=1`
                  ).then(r => r.json())
                  const dbCall = calls?.[0]
                  if (!dbCall?.group_id) return
                  let group = groupsRef.current.find(g => g.id === dbCall.group_id)
                  if (!group) {
                    // Group was created after mount — refresh the cached list
                    const fresh = await fetch('/api/groups').then(r => r.json())
                    if (Array.isArray(fresh)) groupsRef.current = fresh
                    group = groupsRef.current.find(g => g.id === dbCall.group_id)
                  }
                  if (group) {
                    setActiveCall(prev => prev ? { ...prev, groupName: group!.name, groupId: group!.id, groupColor: group!.color ?? undefined } : null)
                    stopRing()
                    startRing('group-inbound')
                  }
                } catch {}
              })()
            }
          }

        // ── ACTIVE ───────────────────────────────────────────────────────────
        } else if (call.state === 'active') {
          stopRing()
          callActiveAtRef.current = Date.now()

          // The waiting call just went active — swap it in, move current to held
          if (waitingCallRef.current && call.id === waitingCallRef.current.id) {
            const prevActive = activeCallRef.current
            if (prevActive) setHeldCall({ ...prevActive, state: 'held' })

            const newActive: ActiveCall = {
              ...waitingCallRef.current,
              state: 'active',
              telnyxCall: call,
            }
            setActiveCall(newActive)
            setWaitingCall(null)

            // Attribute call to this agent
            if (agent) {
              fetch('/api/calls', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'answer',
                  agentId: agent.id,
                  remoteNumber: waitingCallRef.current.remoteNumber.replace(/\D/g, ''),
                  groupId: waitingCallRef.current.groupId,
                  agentCallLegId: call.id,
                }),
              }).catch(() => {})
            }

            // Attach audio for new call
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
            return
          }

          // Normal active — update existing activeCall
          setActiveCall(prev => {
            if (!prev) return null
            // Attribute inbound call to this agent now that they've answered
            if (prev.direction === 'inbound' && agent) {
              fetch('/api/calls', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'answer',
                  agentId: agent.id,
                  remoteNumber: prev.remoteNumber.replace(/\D/g, ''),
                  groupId: prev.groupId,
                  agentCallLegId: call.id,
                }),
              }).catch(() => {})
            } else if (prev.direction === 'outbound') {
              fetch('/api/calls', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'record', callControlId: call.id }),
              }).catch(() => {})
            }
            return { ...prev, state: 'active', telnyxCall: call }
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

        // ── HANGUP / DESTROY ─────────────────────────────────────────────────
        } else if (call.state === 'hangup' || call.state === 'destroy') {
          // Waiting call was declined/timed out remotely
          if (waitingCallRef.current && call.id === waitingCallRef.current.id) {
            setWaitingCall(null)
            return
          }
          // Held call dropped on its own (unusual)
          if (heldCallRef.current && call.id === heldCallRef.current.id) {
            setHeldCall(null)
            return
          }
          // Ignore events for calls we're not tracking.
          // Exception: if the active call is still ringing (not yet answered), any untracked
          // hangup is almost certainly a SIP CANCEL from another agent picking up the parallel-ring.
          // The Telnyx Verto layer can assign a slightly different call ID to the CANCEL vs the
          // original INVITE, so we must not require an exact match in the ringing state.
          if (activeCallRef.current && call.id !== activeCallRef.current.id) {
            if (activeCallRef.current.state !== 'ringing') {
              console.log('[Telnyx] ignoring hangup for non-active leg', call.id)
              return
            }
          }

          // Clean up audio + conference mixing context
          tearDownConferenceAudio()
          const audio = document.getElementById('telnyx-remote-audio') as HTMLAudioElement
          if (audio) { audio.srcObject = null; audio.remove() }
          stopRing()
          outboundCallIdRef.current = null
          setMuted(false)

          // If there's a held call, auto-resume it rather than going to idle
          if (heldCallRef.current) {
            const held = heldCallRef.current
            setHeldCall(null)
            heldCallRef.current = null
            playHangupTone()
            // Transition directly to held call (end-of-call effect writes happen via prevCallRef)
            setActiveCall({ ...held, state: 'held' })
            // Brief settle time, then unhold
            setTimeout(() => { try { held.telnyxCall.unhold() } catch {} }, 50)
          } else {
            setActiveCall(null)
          }

        // ── HELD ─────────────────────────────────────────────────────────────
        } else if (call.state === 'held') {
          // Update whichever call object matches
          if (activeCallRef.current && call.id === activeCallRef.current.id) {
            setActiveCall(prev => prev ? { ...prev, state: 'held', telnyxCall: call } : null)
          } else if (heldCallRef.current && call.id === heldCallRef.current.id) {
            setHeldCall(prev => prev ? { ...prev, state: 'held', telnyxCall: call } : null)
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

  // ── Audio helpers ─────────────────────────────────────────────────────────
  function startRing(type: RingType) {
    stopRing()
    if (typeof window === 'undefined') return
    const ctx = new AudioContext()
    audioCtxRef.current = ctx

    // Chrome's autoplay policy suspends AudioContext created outside a user gesture.
    // resume() unblocks it — agents will have interacted with the page before a ring arrives.
    ctx.resume().catch(() => {})

    // Master gain node — zeroing this in stopRing() cuts audio instantly
    // rather than waiting for AudioContext.close() to drain its buffer.
    const master = ctx.createGain()
    master.gain.value = 1
    master.connect(ctx.destination)
    ringGainRef.current = master

    function tone(freqs: number[], duration: number) {
      const gain = ctx.createGain()
      gain.gain.value = 0.25
      gain.connect(master)          // ← route through master, not directly to destination
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
    // Zero the master gain synchronously — this is processed by the audio engine
    // at exactly currentTime (i.e. right now), giving a clean cut-off with no buffer drain.
    if (ringGainRef.current && audioCtxRef.current) {
      try { ringGainRef.current.gain.setValueAtTime(0, audioCtxRef.current.currentTime) } catch {}
    }
    ringGainRef.current = null
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }
  }

  function playHangupTone() {
    if (typeof window === 'undefined') return
    const ctx = new AudioContext()
    ctx.resume().catch(() => {})
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35)
    gain.connect(ctx.destination)
    const osc = ctx.createOscillator()
    osc.frequency.setValueAtTime(480, ctx.currentTime)
    osc.frequency.linearRampToValueAtTime(280, ctx.currentTime + 0.35)
    osc.connect(gain)
    osc.start()
    osc.stop(ctx.currentTime + 0.35)
    setTimeout(() => ctx.close().catch(() => {}), 600)
  }

  /** Short double-beep to alert agent to the waiting call without being disruptive */
  function playCallWaitingBeep() {
    if (typeof window === 'undefined') return
    const ctx = new AudioContext()
    ctx.resume().catch(() => {})
    const gain = ctx.createGain()
    gain.gain.value = 0.2
    gain.connect(ctx.destination)
    ;[0, 0.35].forEach(offset => {
      const osc = ctx.createOscillator()
      osc.frequency.value = 880
      osc.connect(gain)
      osc.start(ctx.currentTime + offset)
      osc.stop(ctx.currentTime + offset + 0.15)
    })
    setTimeout(() => ctx.close().catch(() => {}), 1200)
  }

  // ── Status helpers ────────────────────────────────────────────────────────
  function setAgentBusy() {
    if (!agent?.id) return
    preCallStatusRef.current = agent.status ?? 'available'
    fetch('/api/agents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: agent.id, status: 'busy' }),
    }).catch(() => {})
    setAgent(prev => prev ? { ...prev, status: 'busy' } : prev)
  }

  // ── Public call actions ───────────────────────────────────────────────────
  async function makeCall(number: string, opts?: { bypassCooldown?: boolean }): Promise<boolean> {
    if (!clientRef.current || !agent) return false
    if (dialingRef.current) return false

    // ── 8-hour cooldown pre-flight check ─────────────────────────────────────
    // Must happen BEFORE client.newCall() so the WebRTC dial never fires when blocked.
    // Bypass when the agent explicitly chose to call (e.g. from a scheduled callback).
    const digits = number.replace(/\D/g, '')
    if (digits.length >= 7 && !opts?.bypassCooldown) {
      try {
        const res = await fetch(`/api/calls/cooldown?phone=${digits}`)
        if (res.ok) {
          const check = await res.json()
          if (check.blocked) {
            const until = new Date(check.until)
            const timeStr = until.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            const msg = `This lead cannot be called again until ${timeStr} (8-hour cooldown after disposition).`
            setCallErrorMsg(msg)
            if (callErrorTimerRef.current) clearTimeout(callErrorTimerRef.current)
            callErrorTimerRef.current = setTimeout(() => setCallErrorMsg(null), 6000)
            return false
          }
        }
      } catch {
        // Network error — let the call proceed rather than silently block
      }
    }

    dialingRef.current = true
    setAgentBusy()

    const call = clientRef.current.newCall({
      destinationNumber: number,
      callerNumber: agent.extension || agent.sip_username,
    })
    outboundCallIdRef.current = call.id

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
    return true
  }

  function clearCallError() {
    if (callErrorTimerRef.current) { clearTimeout(callErrorTimerRef.current); callErrorTimerRef.current = null }
    setCallErrorMsg(null)
  }

  function addPartyCall(number: string) {
    if (!clientRef.current || !agent || !activeCallRef.current) return
    if (activeCallRef.current.state !== 'active') return

    // Hold the current call and immediately move it to heldCall state
    try { activeCallRef.current.telnyxCall.hold() } catch {}
    const callToHold: ActiveCall = { ...activeCallRef.current, state: 'held' }
    heldCallRef.current = callToHold
    setHeldCall(callToHold)

    // Dial the new party via WebRTC
    const call = clientRef.current.newCall({
      destinationNumber: number,
      callerNumber: agent.extension || agent.sip_username,
    })
    outboundCallIdRef.current = call.id

    const newActive: ActiveCall = {
      id: call.id,
      direction: 'outbound',
      remoteNumber: number,
      state: 'ringing',
      telnyxCall: call,
    }
    activeCallRef.current = newActive
    setActiveCall(newActive)
    startRing('outbound')

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
  }

  async function mergeConference(): Promise<void> {
    const active = activeCallRef.current
    const held = heldCallRef.current
    if (!active || !held) return
    if (active.state !== 'active') return

    setConferenceStatus('dialing')

    // Unhold the original call so both legs are live simultaneously
    try { held.telnyxCall.unhold() } catch {}

    // Brief settle time for WebRTC unhold renegotiation
    await new Promise(resolve => setTimeout(resolve, 250))

    const streamA = active.telnyxCall?.remoteStream  // newly added party
    const streamB = held.telnyxCall?.remoteStream    // original call (lead)

    if (!streamA && !streamB) {
      setConferenceStatus('idle')
      try { held.telnyxCall.hold() } catch {}
      return
    }

    // Tear down any previous conference mixing context
    if (conferenceAudioCtxRef.current) {
      conferenceAudioCtxRef.current.close().catch(() => {})
      conferenceAudioCtxRef.current = null
    }

    // Use Web Audio API to mix both remote streams into one output.
    // The agent hears both parties simultaneously.
    // The agent's mic is already being sent to both open PeerConnections by the SDK,
    // so both parties hear the agent without any additional work.
    const ctx = new AudioContext()
    ctx.resume().catch(() => {})
    conferenceAudioCtxRef.current = ctx

    const mixDest = ctx.createMediaStreamDestination()
    if (streamA) ctx.createMediaStreamSource(streamA).connect(mixDest)
    if (streamB) ctx.createMediaStreamSource(streamB).connect(mixDest)

    let audio = document.getElementById('telnyx-remote-audio') as HTMLAudioElement
    if (!audio) {
      audio = Object.assign(document.createElement('audio'), { id: 'telnyx-remote-audio', autoplay: true })
      document.body.appendChild(audio)
    }
    audio.srcObject = mixDest.stream
    audio.play().catch(console.error)

    setConferenceStatus('active')
  }

  function tearDownConferenceAudio() {
    if (conferenceAudioCtxRef.current) {
      conferenceAudioCtxRef.current.close().catch(() => {})
      conferenceAudioCtxRef.current = null
    }
  }

  function answerCall() {
    if (!activeCall?.telnyxCall) return
    setAgentBusy()
    activeCall.telnyxCall.answer()
  }

  function hangupCall() {
    if (!activeCall?.telnyxCall) return
    activeCall.telnyxCall.hangup()
    stopRing()
    tearDownConferenceAudio()
    outboundCallIdRef.current = null
    setMuted(false)
    // Audio cleanup — belt-and-suspenders alongside the Telnyx hangup event handler
    const audio = document.getElementById('telnyx-remote-audio') as HTMLAudioElement
    if (audio) { audio.srcObject = null; audio.remove() }
    setActiveCall(null)
  }

  /** Hold the current active call and answer the waiting call */
  function answerWaiting() {
    const waiting = waitingCallRef.current
    const active = activeCallRef.current
    if (!waiting?.telnyxCall) return
    // Hold current call if it's active (not already held)
    if (active?.telnyxCall && active.state === 'active') {
      try { active.telnyxCall.hold() } catch {}
    }
    // Don't call setAgentBusy() — agent is already busy and preCallStatusRef is already set
    waiting.telnyxCall.answer()
  }

  /** Decline the waiting call without affecting the active call */
  function rejectWaiting() {
    const waiting = waitingCallRef.current
    if (!waiting?.telnyxCall) return
    try { waiting.telnyxCall.hangup() } catch {}
    setWaitingCall(null)
  }

  /** Manually swap back to the held call (hangs up the current active call) */
  function resumeHeld() {
    const held = heldCallRef.current
    const active = activeCallRef.current
    if (!held?.telnyxCall) return
    // Hang up the current active call first
    if (active?.telnyxCall) {
      try { active.telnyxCall.hangup() } catch {}
    }
    // The hangup event handler will auto-resume held — nothing more needed here
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
      localStorage.setItem('dialer_agent_expires', String(Date.now() + 8 * 60 * 60 * 1000))
    } else {
      localStorage.removeItem('dialer_agent')
      localStorage.removeItem('dialer_agent_expires')
      supabase.auth.signOut().catch(() => {})
      fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {})
    }
  }

  return (
    <SoftphoneContext.Provider value={{
      agent,
      setAgent: handleSetAgent,
      agentLoading,
      connected,
      activeCall,
      waitingCall,
      heldCall,
      makeCall,
      addPartyCall,
      mergeConference,
      conferenceStatus,
      answerCall,
      hangupCall,
      answerWaiting,
      rejectWaiting,
      resumeHeld,
      toggleHold,
      toggleMute,
      muted,
      callErrorMsg,
      clearCallError,
    }}>
      {children}
    </SoftphoneContext.Provider>
  )
}

export function useSoftphone() {
  const ctx = useContext(SoftphoneContext)
  if (!ctx) throw new Error('useSoftphone must be used within SoftphoneProvider')
  return ctx
}
