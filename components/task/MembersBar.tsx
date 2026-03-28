'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { type Member, type MemberRole } from '@/lib/types'

type Props = {
  members: Member[]
  currentMember: Member
  isCreator: boolean
  onUpdateMemberRole: (memberId: string, role: MemberRole) => Promise<void>
}

const ROLE_BADGE = {
  creator: { label: 'Creator', bg: '#fdf6ed', color: '#c9a96e', border: '#f0d9a8' },
  admin:   { label: 'Admin',   bg: '#eff6ff', color: '#3b82f6', border: '#bfdbfe' },
  member:  { label: 'Member',  bg: '#F3F4F6', color: '#6b7280', border: '#E8E5E0' },
  visitor: { label: 'Visitor', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
}

export function MembersBar({ members, currentMember, isCreator, onUpdateMemberRole }: Props) {
  const MAX_SHOWN = 5
  const shown = members.slice(0, MAX_SHOWN)
  const overflow = members.length - MAX_SHOWN

  const [openId, setOpenId]     = useState<string | null>(null)
  const [hoverId, setHoverId]   = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  // Fixed position of the open popover (calculated from avatar's bounding rect)
  const [popoverPos, setPopoverPos] = useState<{ top: number; right: number } | null>(null)
  const wrapperRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const popoverRef  = useRef<HTMLDivElement | null>(null)

  // Close on outside mousedown — but NOT when clicking inside the popover itself
  useEffect(() => {
    if (!openId) return
    function handleMouseDown(e: MouseEvent) {
      const wrapper = wrapperRefs.current[openId!]
      const inWrapper = wrapper?.contains(e.target as Node) ?? false
      const inPopover = popoverRef.current?.contains(e.target as Node) ?? false
      if (!inWrapper && !inPopover) {
        setOpenId(null)
        setPopoverPos(null)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [openId])

  function openPopover(memberId: string, el: HTMLDivElement) {
    if (openId === memberId) {
      setOpenId(null)
      setPopoverPos(null)
      return
    }
    const rect = el.getBoundingClientRect()
    setPopoverPos({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    })
    setOpenId(memberId)
  }

  async function changeRole(memberId: string, role: MemberRole) {
    setUpdating(true)
    await onUpdateMemberRole(memberId, role)
    setUpdating(false)
  }

  const openMember = shown.find(m => m.id === openId) ?? null

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
        {shown.map((m, i) => {
          const isCurrent = m.id === currentMember.id
          const initials  = m.nickname.slice(0, 2).toUpperCase()
          const isOpen    = openId === m.id
          const isHovered = hoverId === m.id

          return (
            <div
              key={m.id}
              ref={el => { wrapperRefs.current[m.id] = el }}
              style={{ position: 'relative', marginLeft: i === 0 ? 0 : -8, zIndex: isOpen ? 10 : (shown.length - i) }}
              // Prevent mousedown from bubbling to document (which would close the popover)
              onMouseDown={e => e.stopPropagation()}
            >
              {/* Avatar circle */}
              <div
                onClick={() => {
                  const wrapper = wrapperRefs.current[m.id]
                  if (wrapper) openPopover(m.id, wrapper)
                }}
                onMouseEnter={() => setHoverId(m.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{
                  width: 30, height: 30, borderRadius: '50%', background: m.color,
                  color: '#fff', fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: isCurrent ? '2px solid #c9a96e' : isOpen ? '2px solid #c9a96e' : '2px solid #FAF9F7',
                  boxShadow: isOpen ? '0 0 0 2px #f0d9a8' : '0 1px 4px rgba(0,0,0,0.12)',
                  flexShrink: 0, letterSpacing: '-0.02em',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.15s, border-color 0.15s',
                  userSelect: 'none',
                }}
              >
                {initials}
              </div>

              {/* Hover tooltip (when popover is closed) */}
              {isHovered && !isOpen && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#1a1a1a',
                  color: '#fff',
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  padding: '0.25rem 0.5rem',
                  borderRadius: 6,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  zIndex: 999,
                }}>
                  {m.nickname}{isCurrent ? ' (you)' : ''}
                </div>
              )}
            </div>
          )
        })}

        {overflow > 0 && (
          <div style={{
            marginLeft: -8, width: 30, height: 30, borderRadius: '50%',
            background: '#E8E5E0', color: '#9ca3af', fontSize: '0.625rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #FAF9F7',
          }}>
            +{overflow}
          </div>
        )}
      </div>

      {/* Popover — rendered fixed so it escapes any stacking context */}
      {openMember && popoverPos && (
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            top: popoverPos.top,
            right: popoverPos.right,
            background: '#fff',
            border: '1.5px solid #E8E5E0',
            borderRadius: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
            padding: '1rem',
            minWidth: 210,
            zIndex: 9999,
          }}
        >
          {/* Avatar + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%', background: openMember.color,
              color: '#fff', fontSize: '0.875rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: openMember.id === currentMember.id ? '2px solid #c9a96e' : '2px solid #E8E5E0',
              flexShrink: 0, letterSpacing: '-0.02em',
            }}>
              {openMember.nickname.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a1a' }}>
                {openMember.nickname}
                {openMember.id === currentMember.id && (
                  <span style={{ color: '#c4bfb9', fontWeight: 400, fontSize: '0.75rem' }}> (you)</span>
                )}
              </div>
              {(() => {
                const b = ROLE_BADGE[openMember.role]
                return (
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 600,
                    padding: '0.15rem 0.5rem', borderRadius: 5,
                    border: `1.5px solid ${b.border}`,
                    background: b.bg, color: b.color,
                    display: 'inline-block', marginTop: 2,
                  }}>
                    {b.label}
                  </span>
                )
              })()}
            </div>
          </div>

          {/* Role change (creator only, for non-creator members) */}
          {isCreator && openMember.role !== 'creator' && (
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#c4bfb9', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.375rem' }}>
                Change role
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {([
                  { role: 'admin',   label: 'Admin',   desc: 'Full access except deleting the project', active: '#3b82f6', activeBg: '#eff6ff', inactiveC: '#6b7280' },
                  { role: 'member',  label: 'Member',  desc: 'Can add and edit tasks, read-only on costs', active: '#6b7280', activeBg: '#F3F4F6', inactiveC: '#9ca3af' },
                  { role: 'visitor', label: 'Visitor', desc: 'View only — cannot add or edit anything', active: '#16a34a', activeBg: '#f0fdf4', inactiveC: '#9ca3af' },
                ] as const).map(({ role, label, desc, active, activeBg, inactiveC }) => {
                  const isActive = openMember.role === role
                  return (
                    <button
                      key={role}
                      onClick={() => changeRole(openMember.id, role)}
                      disabled={updating || isActive}
                      title={desc}
                      style={{
                        width: '100%', padding: '0.35rem 0.625rem', borderRadius: 8,
                        fontSize: '0.72rem', fontWeight: 600, textAlign: 'left',
                        cursor: updating || isActive ? 'default' : 'pointer', fontFamily: 'inherit',
                        border: isActive ? `1.5px solid ${active}` : '1.5px solid #E8E5E0',
                        background: isActive ? activeBg : '#fff',
                        color: isActive ? active : inactiveC,
                        opacity: updating ? 0.6 : 1,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}
                    >
                      <span>{label}</span>
                      <span style={{ fontSize: '0.6rem', fontWeight: 400, color: isActive ? active : '#c4bfb9', maxWidth: 130, textAlign: 'right' }}>{desc}</span>
                    </button>
                  )
                })}
              </div>
              {updating && (
                <div style={{ fontSize: '0.65rem', color: '#c9a96e', marginTop: '0.375rem', textAlign: 'center' }}>Saving…</div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}

// Used by TaskCard and TaskDetailModal
export function Avatar({ member, isCurrent, small }: { member: Member; isCurrent: boolean; small?: boolean }) {
  const s = small ? 26 : 30
  return (
    <div
      style={{
        width: s, height: s, borderRadius: '50%', background: member.color,
        color: '#fff', fontSize: s * 0.38, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: isCurrent ? '2px solid #c9a96e' : '2px solid #FAF9F7',
        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        flexShrink: 0, letterSpacing: '-0.02em',
      }}
    >
      {member.nickname.slice(0, 2).toUpperCase()}
    </div>
  )
}
