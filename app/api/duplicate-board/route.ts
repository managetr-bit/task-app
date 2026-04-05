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

// POST /api/duplicate-board  body: { sourceBoardId }
// Copies board → columns → tasks → milestones → budget_lines → cost_transactions → board_notes
// Returns { newBoardId }
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sourceBoardId } = await req.json()
  if (!sourceBoardId) return NextResponse.json({ error: 'sourceBoardId required' }, { status: 400 })

  // 1. Copy board
  const { data: srcBoard, error: boardErr } = await supabase
    .from('boards').select('*').eq('id', sourceBoardId).single()
  if (boardErr || !srcBoard) return NextResponse.json({ error: 'Board not found' }, { status: 404 })

  const { data: newBoard, error: newBoardErr } = await supabase
    .from('boards')
    .insert({
      name: `${srcBoard.name} (copy)`,
      currency: srcBoard.currency,
      description: srcBoard.description,
      location_address: srcBoard.location_address,
      location_lat: srcBoard.location_lat,
      location_lng: srcBoard.location_lng,
      photos: srcBoard.photos,
      file_panel_url: srcBoard.file_panel_url,
    })
    .select().single()
  if (newBoardErr || !newBoard) return NextResponse.json({ error: newBoardErr?.message }, { status: 500 })

  const newBoardId = newBoard.id

  // 2. Copy columns — build old→new id map
  const { data: srcColumns } = await supabase.from('columns').select('*').eq('board_id', sourceBoardId)
  const colMap: Record<string, string> = {}
  if (srcColumns?.length) {
    const { data: newCols } = await supabase
      .from('columns')
      .insert(srcColumns.map(c => ({ board_id: newBoardId, name: c.name, position: c.position })))
      .select()
    newCols?.forEach((nc, i) => { colMap[srcColumns[i].id] = nc.id })
  }

  // 3. Copy tasks (remap column_ids; clear assigned_to / created_by)
  const { data: srcTasks } = await supabase.from('tasks').select('*').eq('board_id', sourceBoardId)
  const taskMap: Record<string, string> = {}
  if (srcTasks?.length) {
    const { data: newTasks } = await supabase
      .from('tasks')
      .insert(srcTasks.map(t => ({
        board_id: newBoardId,
        column_id: colMap[t.column_id] ?? t.column_id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        due_date: t.due_date,
        position: t.position,
        assigned_to: null,
        created_by: null,
        completed_at: t.completed_at,
      })))
      .select()
    newTasks?.forEach((nt, i) => { taskMap[srcTasks[i].id] = nt.id })
  }

  // 4. Copy milestones — build old→new id map, remap depends_on_id in a second pass
  const { data: srcMilestones } = await supabase.from('milestones').select('*').eq('board_id', sourceBoardId)
  const msMap: Record<string, string> = {}
  if (srcMilestones?.length) {
    // First insert without depends_on_id
    const { data: newMs } = await supabase
      .from('milestones')
      .insert(srcMilestones.map(m => ({
        board_id: newBoardId,
        name: m.name,
        target_date: m.target_date,
        completed_at: m.completed_at,
        depends_on_id: null,
        offset_days: m.offset_days ?? 0,
      })))
      .select()
    newMs?.forEach((nm, i) => { msMap[srcMilestones[i].id] = nm.id })

    // Second pass: update depends_on_id
    for (const srcMs of srcMilestones) {
      if (srcMs.depends_on_id && msMap[srcMs.depends_on_id] && msMap[srcMs.id]) {
        await supabase.from('milestones')
          .update({ depends_on_id: msMap[srcMs.depends_on_id] })
          .eq('id', msMap[srcMs.id])
      }
    }

    // Copy milestone_tasks (remap both sides)
    const msIds = srcMilestones.map(m => m.id)
    const { data: srcMsTasks } = await supabase
      .from('milestone_tasks').select('*').in('milestone_id', msIds)
    if (srcMsTasks?.length) {
      const pairs = srcMsTasks
        .filter(mt => msMap[mt.milestone_id] && taskMap[mt.task_id])
        .map(mt => ({ milestone_id: msMap[mt.milestone_id], task_id: taskMap[mt.task_id] }))
      if (pairs.length) await supabase.from('milestone_tasks').insert(pairs)
    }
  }

  // 5. Copy budget_lines (remap milestone_id)
  const { data: srcBudget } = await supabase.from('budget_lines').select('*').eq('board_id', sourceBoardId)
  const budgetMap: Record<string, string> = {}
  if (srcBudget?.length) {
    const { data: newBudget } = await supabase
      .from('budget_lines')
      .insert(srcBudget.map(b => ({
        board_id: newBoardId,
        name: b.name,
        category: b.category,
        type: b.type,
        budgeted_amount: b.budgeted_amount,
        milestone_id: b.milestone_id ? (msMap[b.milestone_id] ?? null) : null,
        expected_date: b.expected_date,
        notes: b.notes,
        position: b.position,
      })))
      .select()
    newBudget?.forEach((nb, i) => { budgetMap[srcBudget[i].id] = nb.id })
  }

  // 6. Copy cost_transactions (remap milestone_id, budget_line_id, task_id)
  const { data: srcTx } = await supabase.from('cost_transactions').select('*').eq('board_id', sourceBoardId)
  if (srcTx?.length) {
    await supabase.from('cost_transactions').insert(srcTx.map(tx => ({
      board_id: newBoardId,
      budget_line_id: tx.budget_line_id ? (budgetMap[tx.budget_line_id] ?? null) : null,
      type: tx.type,
      amount: tx.amount,
      date: tx.date,
      description: tx.description,
      milestone_id: tx.milestone_id ? (msMap[tx.milestone_id] ?? null) : null,
      milestone_offset_days: tx.milestone_offset_days,
      task_id: tx.task_id ? (taskMap[tx.task_id] ?? null) : null,
      is_forecast: tx.is_forecast,
    })))
  }

  // 7. Copy board_notes
  const { data: srcNotes } = await supabase.from('board_notes').select('*').eq('board_id', sourceBoardId)
  if (srcNotes?.length) {
    await supabase.from('board_notes').insert(srcNotes.map(n => ({
      board_id: newBoardId,
      content: n.content,
      author_name: n.author_name,
    })))
  }

  return NextResponse.json({ newBoardId })
}
