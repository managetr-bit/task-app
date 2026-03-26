'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  type Board,
  type Column,
  type Member,
  type Task,
  type Milestone,
  type MilestoneTask,
  type LocalSession,
  type Priority,
  type BoardNote,
  MEMBER_COLORS,
  DEFAULT_COLUMNS,
} from '@/lib/types'
import { NicknameModal } from './NicknameModal'
import { BoardView } from './BoardView'

type Props = { boardId: string }

function getSession(boardId: string): LocalSession | null {
  try {
    const raw = localStorage.getItem(`task_session_${boardId}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveSession(session: LocalSession) {
  localStorage.setItem(`task_session_${session.boardId}`, JSON.stringify(session))
}

function saveRecentBoard(boardId: string, name: string, nickname: string) {
  try {
    const raw = localStorage.getItem('task_recent_boards')
    const list: { boardId: string; name: string; nickname: string; visitedAt: string }[] = raw
      ? JSON.parse(raw)
      : []
    const filtered = list.filter(b => b.boardId !== boardId)
    filtered.unshift({ boardId, name, nickname, visitedAt: new Date().toISOString() })
    localStorage.setItem('task_recent_boards', JSON.stringify(filtered.slice(0, 8)))
  } catch {
    // ignore
  }
}

export function BoardPageClient({ boardId }: Props) {
  const [board, setBoard] = useState<Board | null>(null)
  const [columns, setColumns] = useState<Column[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [currentMember, setCurrentMember] = useState<Member | null>(null)
  const [showNicknameModal, setShowNicknameModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [isCreator, setIsCreator] = useState(false)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [milestoneTasks, setMilestoneTasks] = useState<MilestoneTask[]>([])
  const [notes, setNotes] = useState<BoardNote[]>([])

  // ── Initial load ──
  useEffect(() => {
    async function load() {
      // Fetch board
      const { data: boardData } = await supabase
        .from('boards')
        .select('*')
        .eq('id', boardId)
        .single()

      if (!boardData) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setBoard(boardData)

      // Fetch columns, members, tasks, milestones, notes in parallel
      const [colRes, memRes, taskRes, msRes, mtRes, notesRes] = await Promise.all([
        supabase.from('columns').select('*').eq('board_id', boardId).order('position'),
        supabase.from('members').select('*').eq('board_id', boardId).order('joined_at'),
        supabase.from('tasks').select('*').eq('board_id', boardId).order('position'),
        supabase.from('milestones').select('*').eq('board_id', boardId).order('target_date'),
        supabase.from('milestone_tasks').select('*'),
        supabase.from('board_notes').select('*').eq('board_id', boardId).order('created_at', { ascending: false }),
      ])

      setColumns(colRes.data ?? [])
      setMembers(memRes.data ?? [])
      setTasks(taskRes.data ?? [])
      setMilestones(msRes.data ?? [])
      setMilestoneTasks(mtRes.data ?? [])
      setNotes(notesRes.data ?? [])

      // Check if current user created this board
      try {
        setIsCreator(localStorage.getItem(`task_creator_${boardId}`) === 'true')
      } catch { /* ignore */ }

      // Check for existing session
      const session = getSession(boardId)
      if (session) {
        const match = (memRes.data ?? []).find(m => m.id === session.memberId)
        if (match) {
          setCurrentMember(match)
          saveRecentBoard(boardId, boardData.name, match.nickname)
        } else {
          setShowNicknameModal(true)
        }
      } else {
        setShowNicknameModal(true)
      }

      setLoading(false)
    }
    load()
  }, [boardId])

  // ── Real-time subscriptions ──
  useEffect(() => {
    if (!board) return

    const channel = supabase
      .channel(`board-${boardId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `board_id=eq.${boardId}` },
        payload => {
          if (payload.eventType === 'INSERT') {
            setTasks(prev => [...prev, payload.new as Task])
          } else if (payload.eventType === 'UPDATE') {
            setTasks(prev => prev.map(t => (t.id === (payload.new as Task).id ? (payload.new as Task) : t)))
          } else if (payload.eventType === 'DELETE') {
            setTasks(prev => prev.filter(t => t.id !== (payload.old as Task).id))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members', filter: `board_id=eq.${boardId}` },
        payload => {
          if (payload.eventType === 'INSERT') {
            setMembers(prev => [...prev, payload.new as Member])
          } else if (payload.eventType === 'UPDATE') {
            setMembers(prev =>
              prev.map(m => (m.id === (payload.new as Member).id ? (payload.new as Member) : m))
            )
          } else if (payload.eventType === 'DELETE') {
            setMembers(prev => prev.filter(m => m.id !== (payload.old as Member).id))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'columns', filter: `board_id=eq.${boardId}` },
        payload => {
          if (payload.eventType === 'INSERT') {
            setColumns(prev => {
              if (prev.some(c => c.id === (payload.new as Column).id)) return prev
              return [...prev, payload.new as Column].sort((a, b) => a.position - b.position)
            })
          } else if (payload.eventType === 'UPDATE') {
            setColumns(prev =>
              prev
                .map(c => (c.id === (payload.new as Column).id ? (payload.new as Column) : c))
                .sort((a, b) => a.position - b.position)
            )
          } else if (payload.eventType === 'DELETE') {
            setColumns(prev => prev.filter(c => c.id !== (payload.old as Column).id))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'milestones', filter: `board_id=eq.${boardId}` },
        payload => {
          if (payload.eventType === 'INSERT') {
            setMilestones(prev => [...prev, payload.new as Milestone])
          } else if (payload.eventType === 'DELETE') {
            setMilestones(prev => prev.filter(m => m.id !== (payload.old as Milestone).id))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'milestone_tasks' },
        payload => {
          if (payload.eventType === 'INSERT') {
            const n = payload.new as MilestoneTask
            setMilestoneTasks(prev =>
              prev.some(mt => mt.milestone_id === n.milestone_id && mt.task_id === n.task_id)
                ? prev
                : [...prev, n]
            )
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as MilestoneTask
            setMilestoneTasks(prev => prev.filter(mt => !(mt.milestone_id === old.milestone_id && mt.task_id === old.task_id)))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'board_notes', filter: `board_id=eq.${boardId}` },
        payload => {
          if (payload.eventType === 'INSERT') {
            setNotes(prev => {
              if (prev.some(n => n.id === (payload.new as BoardNote).id)) return prev
              return [payload.new as BoardNote, ...prev]
            })
          } else if (payload.eventType === 'DELETE') {
            setNotes(prev => prev.filter(n => n.id !== (payload.old as BoardNote).id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [boardId, board])

  // ── Actions ──
  const joinBoard = useCallback(
    async (nickname: string) => {
      const existingColors = members.map(m => m.color)
      const color = MEMBER_COLORS.find(c => !existingColors.includes(c)) ?? MEMBER_COLORS[members.length % MEMBER_COLORS.length]

      const { data: member, error } = await supabase
        .from('members')
        .insert({ board_id: boardId, nickname, color })
        .select()
        .single()

      if (error || !member) return

      const session: LocalSession = {
        boardId,
        memberId: member.id,
        nickname: member.nickname,
        color: member.color,
      }
      saveSession(session)
      saveRecentBoard(boardId, board!.name, nickname)
      setCurrentMember(member)
      setShowNicknameModal(false)
    },
    [boardId, board, members]
  )

  const createTask = useCallback(
    async (params: {
      columnId: string
      title: string
      priority: Priority
      dueDate: string | null
      description: string
    }) => {
      if (!currentMember) return
      const maxPos = tasks.filter(t => t.column_id === params.columnId).length
      await supabase.from('tasks').insert({
        board_id: boardId,
        column_id: params.columnId,
        title: params.title,
        priority: params.priority,
        due_date: params.dueDate || null,
        description: params.description || null,
        created_by: currentMember.id,
        position: maxPos,
      })
    },
    [boardId, currentMember, tasks]
  )

  const moveTask = useCallback(
    async (taskId: string, newColumnId: string) => {
      const task = tasks.find(t => t.id === taskId)
      if (!task) return

      const doneCol = columns.find(c => c.name === 'Done')
      const isMovingToDone = doneCol && newColumnId === doneCol.id
      const wasInDone = doneCol && task.column_id === doneCol.id

      await supabase
        .from('tasks')
        .update({
          column_id: newColumnId,
          completed_at:
            isMovingToDone && !wasInDone ? new Date().toISOString() : wasInDone && !isMovingToDone ? null : task.completed_at,
        })
        .eq('id', taskId)
    },
    [tasks, columns]
  )

  const assignTask = useCallback(
    async (taskId: string, memberId: string | null) => {
      await supabase.from('tasks').update({ assigned_to: memberId }).eq('id', taskId)
    },
    []
  )

  const updateTask = useCallback(
    async (taskId: string, updates: Partial<Pick<Task, 'title' | 'description' | 'priority' | 'due_date'>>) => {
      await supabase.from('tasks').update(updates).eq('id', taskId)
    },
    []
  )

  const deleteTask = useCallback(async (taskId: string) => {
    await supabase.from('tasks').delete().eq('id', taskId)
    setMilestoneTasks(prev => prev.filter(mt => mt.task_id !== taskId))
  }, [])

  const addColumn = useCallback(
    async (name: string) => {
      const maxPos = columns.length
      const { data, error } = await supabase
        .from('columns')
        .insert({ board_id: boardId, name, position: maxPos })
        .select()
        .single()
      if (error) { console.error('addColumn error:', error); return }
      if (data) setColumns(prev => [...prev, data].sort((a, b) => a.position - b.position))
    },
    [boardId, columns]
  )

  const reorderTask = useCallback(
    async (taskId: string, newIndex: number, columnId: string) => {
      const colTasks = tasks
        .filter(t => t.column_id === columnId)
        .sort((a, b) => a.position - b.position)

      const dragged = colTasks.find(t => t.id === taskId)
      if (!dragged) return

      const withoutDragged = colTasks.filter(t => t.id !== taskId)
      const clampedIndex = Math.max(0, Math.min(newIndex, withoutDragged.length))
      withoutDragged.splice(clampedIndex, 0, dragged)

      await Promise.all(
        withoutDragged.map((t, i) =>
          supabase.from('tasks').update({ position: i }).eq('id', t.id)
        )
      )
    },
    [tasks]
  )

  const updateFilePanelUrl = useCallback(
    async (url: string | null) => {
      const { data } = await supabase
        .from('boards')
        .update({ file_panel_url: url })
        .eq('id', boardId)
        .select()
        .single()
      if (data) setBoard(data)
    },
    [boardId]
  )

  const updateBoardName = useCallback(
    async (name: string) => {
      const { data } = await supabase
        .from('boards')
        .update({ name })
        .eq('id', boardId)
        .select()
        .single()
      if (data) {
        setBoard(data)
        // Update recent boards list too
        const session = getSession(boardId)
        if (session) saveRecentBoard(boardId, name, session.nickname)
      }
    },
    [boardId]
  )

  const addMilestone = useCallback(
    async (name: string, targetDate: string) => {
      const { data, error } = await supabase
        .from('milestones')
        .insert({ board_id: boardId, name, target_date: targetDate })
        .select()
        .single()
      if (error) { console.error('Milestone insert error:', error); return }
      if (data) setMilestones(prev => [...prev, data])
    },
    [boardId]
  )

  const deleteMilestone = useCallback(async (milestoneId: string) => {
    // Optimistic: remove from UI immediately
    setMilestones(prev => prev.filter(m => m.id !== milestoneId))
    setMilestoneTasks(prev => prev.filter(mt => mt.milestone_id !== milestoneId))
    const { error } = await supabase.from('milestones').delete().eq('id', milestoneId)
    if (error) console.error('deleteMilestone error:', error)
  }, [])

  const linkTask = useCallback(async (milestoneId: string, taskId: string) => {
    // Optimistic update first
    setMilestoneTasks(prev => {
      if (prev.some(mt => mt.milestone_id === milestoneId && mt.task_id === taskId)) return prev
      return [...prev, { milestone_id: milestoneId, task_id: taskId }]
    })
    const { error } = await supabase
      .from('milestone_tasks')
      .upsert({ milestone_id: milestoneId, task_id: taskId }, { onConflict: 'milestone_id,task_id', ignoreDuplicates: true })
    if (error) console.error('linkTask error:', error)
  }, [])

  const unlinkTask = useCallback(async (milestoneId: string, taskId: string) => {
    await supabase.from('milestone_tasks').delete().eq('milestone_id', milestoneId).eq('task_id', taskId)
    setMilestoneTasks(prev => prev.filter(mt => !(mt.milestone_id === milestoneId && mt.task_id === taskId)))
  }, [])

  const updateMilestoneDate = useCallback(async (milestoneId: string, newDate: string) => {
    setMilestones(prev => prev.map(m => m.id === milestoneId ? { ...m, target_date: newDate } : m))
    const { error } = await supabase.from('milestones').update({ target_date: newDate }).eq('id', milestoneId)
    if (error) console.error('updateMilestoneDate error:', error)
  }, [])

  const addNote = useCallback(async (content: string) => {
    if (!currentMember) return
    const { data, error } = await supabase
      .from('board_notes')
      .insert({ board_id: boardId, content, author_name: currentMember.nickname })
      .select()
      .single()
    if (error) console.error('addNote error:', error)
    if (data) setNotes(prev => [data, ...prev])
  }, [boardId, currentMember])

  const deleteNote = useCallback(async (noteId: string) => {
    setNotes(prev => prev.filter(n => n.id !== noteId))
    await supabase.from('board_notes').delete().eq('id', noteId)
  }, [])

  const deleteColumn = useCallback(
    async (columnId: string, targetColumnId?: string) => {
      if (targetColumnId) {
        await supabase.from('tasks').update({ column_id: targetColumnId }).eq('column_id', columnId)
        setTasks(prev => prev.map(t => t.column_id === columnId ? { ...t, column_id: targetColumnId } : t))
      } else {
        setTasks(prev => prev.filter(t => t.column_id !== columnId))
      }
      await supabase.from('columns').delete().eq('id', columnId)
      setColumns(prev => prev.filter(c => c.id !== columnId))
    },
    []
  )

  const renameColumn = useCallback(async (columnId: string, name: string) => {
    await supabase.from('columns').update({ name }).eq('id', columnId)
    setColumns(prev => prev.map(c => c.id === columnId ? { ...c, name } : c))
  }, [])

  const reorderColumn = useCallback(
    async (columnId: string, newIndex: number) => {
      const sorted = [...columns].sort((a, b) => a.position - b.position)
      const oldIndex = sorted.findIndex(c => c.id === columnId)
      if (oldIndex === -1 || oldIndex === newIndex) return
      const reordered = [...sorted]
      const [moved] = reordered.splice(oldIndex, 1)
      reordered.splice(newIndex, 0, moved)
      setColumns(reordered.map((c, i) => ({ ...c, position: i })))
      await Promise.all(reordered.map((c, i) => supabase.from('columns').update({ position: i }).eq('id', c.id)))
    },
    [columns]
  )

  // ── Render states ──
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FAF9F7',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '3px solid #E8E5E0',
            borderTopColor: '#c9a96e',
          }}
          className="animate-spin"
        />
      </div>
    )
  }

  if (notFound) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FAF9F7',
          gap: '1rem',
        }}
      >
        <p style={{ fontSize: '2rem' }}>🔍</p>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1a1a1a' }}>Board not found</h1>
        <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
          This board doesn't exist or has been deleted.
        </p>
        <a href="/" className="btn-primary" style={{ marginTop: '0.5rem', textDecoration: 'none' }}>
          Create a new board
        </a>
      </div>
    )
  }

  return (
    <>
      {showNicknameModal && (
        <NicknameModal
          boardName={board?.name ?? ''}
          onJoin={joinBoard}
        />
      )}
      {!showNicknameModal && board && currentMember && (
        <BoardView
          board={board}
          columns={columns}
          members={members}
          tasks={tasks}
          currentMember={currentMember}
          isCreator={isCreator}
          milestones={milestones}
          milestoneTasks={milestoneTasks}
          notes={notes}
          onCreateTask={createTask}
          onMoveTask={moveTask}
          onReorderTask={reorderTask}
          onAssignTask={assignTask}
          onUpdateTask={updateTask}
          onDeleteTask={deleteTask}
          onAddColumn={addColumn}
          onDeleteColumn={deleteColumn}
          onRenameColumn={renameColumn}
          onReorderColumn={reorderColumn}
          onUpdateFilePanelUrl={updateFilePanelUrl}
          onUpdateBoardName={updateBoardName}
          onAddMilestone={addMilestone}
          onDeleteMilestone={deleteMilestone}
          onUpdateMilestoneDate={updateMilestoneDate}
          onLinkTask={linkTask}
          onUnlinkTask={unlinkTask}
          onAddNote={addNote}
          onDeleteNote={deleteNote}
        />
      )}
    </>
  )
}
