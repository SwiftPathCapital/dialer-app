export type AgentStatus = 'available' | 'busy' | 'offline'

export interface Agent {
  id: string
  name: string
  email: string
  sip_username: string
  sip_password: string
  status: AgentStatus
  extension: string | null
  voicemail_greeting_url: string | null
  updated_at: string
}

export interface InboundGroup {
  id: string
  name: string
  phone_number: string | null
  voicemail_enabled: boolean
  created_at: string
}

export interface InboundGroupMember {
  group_id: string
  agent_id: string
}

export interface Call {
  id: string
  direction: 'inbound' | 'outbound'
  from_number: string
  to_number: string
  agent_id: string | null
  group_id: string | null
  status: string
  duration_seconds: number | null
  telnyx_call_control_id: string | null
  started_at: string
  ended_at: string | null
}

export interface Voicemail {
  id: string
  call_id: string | null
  group_id: string | null
  from_number: string
  recording_url: string
  transcription: string | null
  listened: boolean
  created_at: string
}

export interface SMSConversation {
  id: string
  contact_number: string
  our_number: string
  group_id: string | null
  last_message_at: string | null
}

export interface SMSMessage {
  id: string
  conversation_id: string
  direction: 'inbound' | 'outbound'
  body: string
  telnyx_message_id: string | null
  sent_at: string
}
