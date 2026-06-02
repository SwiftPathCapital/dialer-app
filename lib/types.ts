export type AgentStatus = 'available' | 'busy' | 'offline'

export interface Agent {
  id: string
  name: string
  email: string
  sip_username: string
  sip_password: string
  status: AgentStatus
  role: 'admin' | 'agent'
  extension: string | null
  voicemail_greeting_url: string | null
  updated_at: string
}

export interface InboundGroup {
  id: string
  name: string
  phone_number: string | null
  voicemail_enabled: boolean
  color: string | null
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

export interface Lead {
  id: string
  name: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  company_name: string | null
  email: string | null
  state: string | null
  city: string | null
  status: string | null
  lead_type: string | null
  lead_type_label: string | null
  assigned_to: string | null
  created_at: string
  revenue: string | null
  monthly_deposit: string | null
  requested_amount: string | null
  tib: string | null
  fico: string | null
  employee_size: string | null
  why_funds: string | null
  last_called_at: string | null
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
