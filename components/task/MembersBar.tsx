'use client'

import { type Member } from '@/lib/types'

type Props = {
  members: Member[]
  currentMember: Member
}

function Avatar({ member, isCurrent, small }: { member: Member; isCurrent: boolean; small?: boolean }) {
  const s = small ? 26 : 30
  const initials = member.nickname.slice(0, 2).toUpperCase()
  return (
    <div
      title={`${member.nickname}${isCurrent ? ' (you)' : ''}`}
      style={{
        width: s,
        height: s,
        borderRadius: '50%',
        background: member.color,
        color: '#fff',
        fontSize: s * 0.38,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: isCurrent ? '2px solid #c9a96e' : '2px solid #FAF9F7',
        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        flexShrink: 0,
        letterSpacing: '-0.02em',
      }}
    >
      {initials}
    </div>
  )
}

export function MembersBar({ members, currentMember }: Props) {
  const MAX_SHOWN = 5
  const shown = members.slice(0, MAX_SHOWN)
  const overflow = members.length - MAX_SHOWN

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        flexShrink: 0,
      }}
    >
      {shown.map((m, i) => (
        <div key={m.id} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: shown.length - i }}>
          <Avatar member={m} isCurrent={m.id === currentMember.id} />
        </div>
      ))}
      {overflow > 0 && (
        <div
          style={{
            marginLeft: -8,
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: '#E8E5E0',
            color: '#9ca3af',
            fontSize: '0.625rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #FAF9F7',
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  )
}

export { Avatar }
