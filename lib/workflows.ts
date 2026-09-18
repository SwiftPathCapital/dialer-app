import { createServerClient } from './supabase'
import { sendSms } from './sms'

interface WorkflowNode {
  id: string
  type: 'trigger' | 'sms' | 'tag' | 'callback'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
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
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '')
}

// Runs every enabled workflow whose trigger_dispositions includes this disposition.
// Fire-and-forget from the caller — errors here should never block a disposition save.
export async function runWorkflowsForDisposition({ tenantId, disposition, leadId, agentId, leadPhone }: RunWorkflowsParams): Promise<void> {
  if (!leadId) return // tag/callback/SMS actions all need a real lead

  const db = createServerClient()

  let workflowQuery = db
    .from('dialer_workflows')
    .select('id, nodes, edges')
    .eq('enabled', true)
    .contains('trigger_dispositions', [disposition])
  if (tenantId) workflowQuery = workflowQuery.eq('tenant_id', tenantId)

  const { data: workflows } = await workflowQuery
  if (!workflows || workflows.length === 0) return

  const [{ data: lead }, { data: agent }] = await Promise.all([
    db.from('leads').select('name, first_name, last_name, company_name, phone').eq('id', leadId).single(),
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
      try {
        if (node.type === 'sms') {
          if (!phone || !agent?.did) return
          const message = renderTemplate(node.data?.message || '', templateVars)
          if (!message.trim()) return
          await sendSms({ from: agent.did, to: phone, body: message, agentId })
        } else if (node.type === 'tag') {
          const tagId = node.data?.tagId
          if (!tagId) return
          await db.from('lead_tags').upsert({ lead_id: leadId, tag_id: tagId }, { onConflict: 'lead_id,tag_id' })
        } else if (node.type === 'callback') {
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
            ...(tenantId ? { tenant_id: tenantId } : {}),
          })
        }
      } catch (err) {
        console.error(`Workflow action failed (workflow ${workflow.id}, node ${node.id}):`, err)
      }
    }))
  }
}
