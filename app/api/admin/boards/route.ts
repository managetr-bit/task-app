import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

function authorized(req: NextRequest) {
  return (
    !!process.env.ADMIN_PASSWORD &&
    req.headers.get('x-admin-token') === process.env.ADMIN_PASSWORD
  )
}

// GET /api/admin/boards — list all boards with member / task / milestone counts
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: boards, error } = await supabase
    .from('boards')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch counts for all boards in parallel
  const rows = await Promise.all(
    (boards ?? []).map(async board => {
      const [mem, tsk, ms] = await Promise.all([
        supabase.from('members').select('*', { count: 'exact', head: true }).eq('board_id', board.id),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('board_id', board.id),
        supabase.from('milestones').select('*', { count: 'exact', head: true }).eq('board_id', board.id),
      ])
      return {
        ...board,
        memberCount:    mem.count    ?? 0,
        taskCount:      tsk.count    ?? 0,
        milestoneCount: ms.count     ?? 0,
      }
    }),
  )

  return NextResponse.json(rows)
}

// DELETE /api/admin/boards  body: { id }  — cascade-delete a board and all its data
export async function DELETE(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Resolve IDs needed for junction-table cleanup
  const [{ data: milestones }, { data: tasks }] = await Promise.all([
    supabase.from('milestones').select('id').eq('board_id', id),
    supabase.from('tasks').select('id').eq('board_id', id),
  ])

  // Delete milestone_tasks via both FK sides
  const msIds  = (milestones ?? []).map(m => m.id)
  const tskIds = (tasks      ?? []).map(t => t.id)
  if (msIds.length)  await supabase.from('milestone_tasks').delete().in('milestone_id', msIds)
  if (tskIds.length) await supabase.from('milestone_tasks').delete().in('task_id',      tskIds)

  // Delete remaining child rows then the board itself
  await supabase.from('milestones').delete().eq('board_id', id)
  await supabase.from('tasks')     .delete().eq('board_id', id)
  await supabase.from('columns')   .delete().eq('board_id', id)
  await supabase.from('members')   .delete().eq('board_id', id)
  await supabase.from('boards')    .delete().eq('id',       id)

  return NextResponse.json({ ok: true })
}
