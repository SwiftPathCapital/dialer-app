import { createServerClient } from '@/lib/supabase'

interface Props {
  searchParams: { groupId?: string }
}

export default async function ScriptPage({ searchParams }: Props) {
  const { groupId } = searchParams

  let scriptText: string | null = null
  let groupName: string | null = null
  let errorMsg: string | null = null

  if (!groupId) {
    errorMsg = 'No group specified.'
  } else {
    const db = createServerClient()
    const { data, error } = await db
      .from('inbound_groups')
      .select('name, script_text, script_enabled')
      .eq('id', groupId)
      .single()

    if (error || !data) {
      errorMsg = 'Group not found.'
    } else if (!data.script_enabled) {
      errorMsg = 'Script is disabled for this group.'
    } else {
      groupName = data.name
      scriptText = data.script_text
    }
  }

  return (
    <>
      <style>{`
        html, body { margin: 0; padding: 0; }
        body {
          background: #0f172a;
          color: #e2e8f0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 14px;
          line-height: 1.6;
          padding: 20px 24px;
          min-height: 100vh;
        }
        .header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid #1e293b;
        }
        .badge {
          background: #2563eb;
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 2px 8px;
          border-radius: 9999px;
        }
        .group-name { font-size: 16px; font-weight: 600; color: #fff; }
        .script { white-space: pre-wrap; color: #cbd5e1; font-size: 14px; line-height: 1.8; }
        .empty { color: #64748b; }
        .error { color: #f87171; padding: 40px; text-align: center; font-size: 15px; }
      `}</style>

      {errorMsg ? (
        <div className="error">{errorMsg}</div>
      ) : (
        <>
          <div className="header">
            <span className="badge">Inbound Call</span>
            <span className="group-name">{groupName}</span>
          </div>
          <div className="script">
            {scriptText
              ? scriptText
              : <span className="empty">No script written yet for this group.</span>
            }
          </div>
        </>
      )}
    </>
  )
}
