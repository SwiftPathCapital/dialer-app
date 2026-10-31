import { createServerClient } from './supabase'
import { sendSms } from './sms'
import { sendEmail } from './email'

type ActionKind = 'sms' | 'tag' | 'callback' | 'email'

// The builder (app/admin/workflows) saves every action as a React Flow node of type
// 'action' with the action in data.kind; nodes typed by kind directly are accepted too.
interface WorkflowNode {
  id: string
  type: 'trigger' | 'action' | ActionKind
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
}

function actionKind(node: WorkflowNode): ActionKind | null {
  const kind = node.type === 'action' ? node.data?.kind : node.type
  return kind === 'sms' || kind === 'tag' || kind === 'callback' || kind === 'email' ? kind : null
}

interface WorkflowEdge {
  id: string
  source: string
  target: string
}

interface RunWorkflowsParams {
  tenantId: string | null
  disposition: string
  leadId: string | null
  agentId: string
  leadPhone: string | null
  // Set when the disposition flow itself already scheduled a callback at an agent-chosen
  // time (e.g. the "Callback" disposition's date/time picker). When present, a workflow's
  // own Create Callback action is skipped — creating one would just duplicate it with the
  // wrong (offset-based) time instead of the time the agent actually picked.
  callbackAt: string | null
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '')
}

// Runs every enabled workflow whose trigger_dispositions includes this disposition.
// Fire-and-forget from the caller — errors here should never block a disposition save.
export async function runWorkflowsForDisposition({ tenantId, disposition, leadId, agentId, leadPhone, callbackAt }: RunWorkflowsParams): Promise<void> {
  if (!leadId || !tenantId) return // actions need a real lead; never run without an account

  const db = createServerClient()

  const { data: workflows } = await db
    .from('dialer_workflows')
    .select('id, nodes, edges')
    .eq('enabled', true)
    .eq('tenant_id', tenantId)
    .contains('trigger_dispositions', [disposition])
  if (!workflows || workflows.length === 0) return

  const [{ data: lead }, { data: agent }] = await Promise.all([
    db.from('leads').select('name, first_name, last_name, company_name, phone, email').eq('id', leadId).single(),
    db.from('agents').select('name, did').eq('id', agentId).single(),
  ])

  const phone = leadPhone || lead?.phone || null
  const leadName = lead?.company_name || [lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || lead?.name || 'there'
  const templateVars = { lead_name: leadName, agent_name: agent?.name || 'your agent' }

  for (const workflow of workflows) {
    const nodes = (workflow.nodes || []) as WorkflowNode[]
    const edges = (workflow.edges || []) as WorkflowEdge[]
    const triggerNode = nodes.find(n => n.type === 'trigger')
    if (!triggerNode) continue

    const actionNodeIds = edges.filter(e => e.source === triggerNode.id).map(e => e.target)
    const actionNodes = nodes.filter(n => actionNodeIds.includes(n.id))

    await Promise.all(actionNodes.map(async node => {
      const kind = actionKind(node)
      try {
        if (kind === 'sms') {
          if (!phone || !agent?.did) return
          const message = renderTemplate(node.data?.message || '', templateVars)
          if (!message.trim()) return
          await sendSms({ from: agent.did, to: phone, body: message, agentId })
        } else if (kind === 'email') {
          if (!lead?.email) return
          const subject = renderTemplate(node.data?.subject || '', templateVars)
          const body = renderTemplate(node.data?.body || '', templateVars)
          if (!subject.trim() && !body.trim()) return
          await sendEmail({ to: lead.email, subject, body })
        } else if (kind === 'tag') {
          const tagId = node.data?.tagId
          if (!tagId) return
          await db.from('lead_tags').upsert({ lead_id: leadId, tag_id: tagId }, { onConflict: 'lead_id,tag_id' })
        } else if (kind === 'callback') {
          // The disposition flow itself already scheduled a callback at the agent's chosen
          // time (e.g. the "Callback" disposition's date/time picker) — creating another one
          // here would just duplicate it at the wrong (offset-based) time.
          if (callbackAt) return

          const offsetMinutes = Number(node.data?.offsetMinutes) || 0
          const scheduledAt = new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString()

          const { data: personalCal } = await db
            .from('calendars')
            .select('id')
            .eq('owner_agent_id', agentId)
            .eq('type', 'personal')
            .single()

          await db.from('dialer_callbacks').insert({
            lead_id: leadId,
            lead_phone: phone,
            lead_name: leadName,
            agent_id: agentId,
            scheduled_at: scheduledAt,
            notes: node.data?.notes || null,
            event_type: node.data?.eventType || 'callback',
            calendar_id: personalCal?.id ?? null,
            tenant_id: tenantId,
          })
        }
      } catch (err) {
        console.error(`Workflow action failed (workflow ${workflow.id}, node ${node.id}):`, err)
      }
    }))
  }
}
