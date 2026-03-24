'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  type Board,
  type Column,
  type Member,
  type Task,
  type LocalSession,
  type Priority,
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

      // Fetch columns, members, tasks in parallel
      const [colRes, memRes, taskRes] = await Promise.all([
        supabase.from('columns').select('*').eq('board_id', boardId).order('position'),
        supabase.from('members').select('*').eq('board_id', boardId).order('joined_at'),
        supabase.from('tasks').select('*').eq('board_id', boardId).order('position'),
      ])

      setColumns(colRes.data ?? [])
      setMembers(memRes.data ?? [])
      setTasks(taskRes.data ?? [])

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
            setColumns(prev =>
              [...prev, payload.new as Column].sort((a, b) => a.position - b.position)
            )
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
  }, [])

  const addColumn = useCallback(
    async (name: string) => {
      const maxPos = columns.length
      await supabase.from('columns').insert({ board_id: boardId, name, position: maxPos })
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

  const deleteColumn = useCallback(
    async (columnId: string) => {
      // Move tasks in this column to first column first
      if (columns.length > 1) {
        const firstCol = columns.find(c => c.id !== columnId)
        if (firstCol) {
          await supabase
            .from('tasks')
            .update({ column_id: firstCol.id })
            .eq('column_id', columnId)
        }
      }
      await supabase.from('columns').delete().eq('id', columnId)
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
          onCreateTask={createTask}
          onMoveTask={moveTask}
          onReorderTask={reorderTask}
          onAssignTask={assignTask}
          onUpdateTask={updateTask}
          onDeleteTask={deleteTask}
          onAddColumn={addColumn}
          onDeleteColumn={deleteColumn}
          onUpdateFilePanelUrl={updateFilePanelUrl}
          onUpdateBoardName={updateBoardName}
        />
      )}
    </>
  )
}
