'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight, Compass } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

interface Step {
  title: string
  body: string
  target?: string
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center'
  adminOnly?: boolean
}

const ALL_STEPS: Step[] = [
  {
    title: 'Welcome to SwiftPath Dialer',
    body: 'This quick tour walks you through every feature. Use the arrows below to navigate, or click X to close.',
    position: 'center',
  },
  {
    title: 'Softphone',
    body: 'Your main dialing screen. Work through your lead queue and dial leads one at a time. The manual dialpad is here too for any number you need to call.',
    target: '[data-tour="nav-softphone"]',
    position: 'right',
  },
  {
    title: 'Lead Queue',
    body: "Your leads load automatically — company, contact, phone, and business details. Click Call to dial or Skip to move on. After every call a wrap-up screen appears so you can add notes and pick a disposition (Interested, Callback, etc.) which saves to the CRM.",
    position: 'center',
  },
  {
    title: 'Active Call Controls',
    body: 'While on a call you can Mute your mic, put the caller on Hold with hold music, or Hang Up. Everything runs through your browser — no desk phone needed.',
    position: 'center',
  },
  {
    title: 'Inbound Calls',
    body: "When a call comes in for you or your group a pop-up appears in the bottom-right corner showing the caller's number and which group it came from. Click Answer or Decline.",
    position: 'center',
  },
  {
    title: 'SMS Inbox',
    body: 'Two-way texting with your leads. Conversations update in real time and the full history is always there.',
    target: '[data-tour="nav-sms"]',
    position: 'right',
  },
  {
    title: 'Voicemail',
    body: "Callers who don't get an answer are sent to voicemail automatically. A red badge tells you how many are unheard. Click any voicemail to listen to it.",
    target: '[data-tour="nav-voicemail"]',
    position: 'right',
  },
  {
    title: 'Your Status',
    body: 'Switch between Available, Busy, or Offline. Inbound group calls only ring agents set to Available — switch to Offline when stepping away so calls go to the next agent.',
    target: '[data-tour="status-picker"]',
    position: 'top',
  },
  {
    title: 'Live Monitor',
    body: "Watch every active call in real time. Click Monitor on any call to silently listen in — the agent and caller won't know you're there. Great for training and coaching.",
    target: '[data-tour="nav-monitor"]',
    position: 'right',
    adminOnly: true,
  },
  {
    title: 'Call Center',
    body: 'Review call history across all agents. The Call Recordings tab lets you play back every recorded call and filter by length to find the conversations that matter. Voicemails are here too.',
    target: '[data-tour="nav-calls"]',
    position: 'right',
    adminOnly: true,
  },
  {
    title: 'Call Groups',
    body: "Create inbound ring groups and assign agents to them. When someone calls the group's number all available agents ring simultaneously — first to answer gets the call.",
    target: '[data-tour="nav-groups"]',
    position: 'right',
    adminOnly: true,
  },
  {
    title: "You're all set!",
    body: "That covers everything. Click the Tour button in the sidebar any time to run through this again. Good luck on your calls!",
    position: 'center',
  },
]

const PAD = 10
const TW = 300

export default function Tour() {
  const { agent } = useSoftphone()
  const [active, setActive] = useState(false)
  const [idx, setIdx] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const steps = ALL_STEPS.filter(s => !s.adminOnly || agent?.role === 'admin')
  const step = steps[idx]
  const total = steps.length

  useEffect(() => {
    if (!active || !step?.target) { setRect(null); return }
    const el = document.querySelector(step.target)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [active, idx])

  function open() { setIdx(0); setActive(true) }
  function close() { setActive(false) }
  function next() { if (idx < total - 1) setIdx(i => i + 1); else close() }
  function back() { if (idx > 0) setIdx(i => i - 1) }

  if (!mounted) return null

  const isCenter = !rect || step.position === 'center'

  let tooltipStyle: React.CSSProperties = {}
  if (!isCenter && rect) {
    const pos = step.position ?? 'right'
    const midY = rect.top + rect.height / 2
    const midX = rect.left + rect.width / 2
    if (pos === 'right') {
      tooltipStyle = { position: 'fixed', left: rect.right + PAD + 8, top: midY, transform: 'translateY(-50%)', width: TW }
    } else if (pos === 'left') {
      tooltipStyle = { position: 'fixed', right: window.innerWidth - rect.left + PAD + 8, top: midY, transform: 'translateY(-50%)', width: TW }
    } else if (pos === 'top') {
      tooltipStyle = { position: 'fixed', left: Math.max(16, midX - TW / 2), bottom: window.innerHeight - rect.top + PAD + 8, width: TW }
    } else if (pos === 'bottom') {
      tooltipStyle = { position: 'fixed', left: Math.max(16, midX - TW / 2), top: rect.bottom + PAD + 8, width: TW }
    }
  }

  return (
    <>
      <button
        onClick={open}
        className="flex items-center gap-2 text-xs text-gray-500 hover:text-blue-400 transition-colors w-full mt-1"
      >
        <Compass className="w-4 h-4 shrink-0" />
        <span className="hidden md:block">Tour</span>
      </button>

      {active && createPortal(
        <>
          {isCenter ? (
            <div className="fixed inset-0 bg-black/75 z-[9998]" onClick={close} />
          ) : (
            <svg className="fixed inset-0 w-full h-full pointer-events-none z-[9998]">
              <defs>
                <mask id="tour-mask">
                  <rect width="100%" height="100%" fill="white" />
                  <rect
                    x={rect!.left - PAD}
                    y={rect!.top - PAD}
                    width={rect!.width + PAD * 2}
                    height={rect!.height + PAD * 2}
                    rx="8"
                    fill="black"
                  />
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(0,0,0,0.75)" mask="url(#tour-mask)" />
            </svg>
          )}

          <div
            className={`z-[9999] bg-gray-800 border border-gray-600 rounded-2xl shadow-2xl p-5 ${
              isCenter ? 'fixed w-80 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2' : ''
            }`}
            style={isCenter ? undefined : tooltipStyle}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="text-white font-semibold text-sm leading-snug">{step.title}</h3>
              <button onClick={close} className="text-gray-500 hover:text-white shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-gray-400 text-sm leading-relaxed mb-4">{step.body}</p>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  className={`rounded-full transition-all duration-200 ${
                    i === idx ? 'w-4 h-1.5 bg-blue-500' : 'w-1.5 h-1.5 bg-gray-600 hover:bg-gray-400'
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={back}
                disabled={idx === 0}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-white disabled:opacity-0 px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={next}
                className={`flex items-center gap-1 text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${
                  idx === total - 1
                    ? 'bg-green-600 hover:bg-green-500 text-white'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {idx === total - 1 ? 'Done' : <><span>Next</span><ChevronRight className="w-4 h-4" /></>}
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  )
}
