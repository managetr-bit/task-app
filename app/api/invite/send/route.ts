import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

export async function POST(req: NextRequest) {
  const { to, boardName, inviteUrl, senderName } = await req.json()

  if (!to || !inviteUrl) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // Signal the client to fall back to mailto
    return NextResponse.json({ fallback: true }, { status: 200 })
  }

  const resend = new Resend(apiKey)

  const { error } = await resend.emails.send({
    from: 'Task App <invites@omercimen.com>',
    to,
    subject: `${senderName || 'Someone'} invited you to "${boardName}"`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
        <h2 style="font-size: 1.25rem; color: #1a1a1a; margin-bottom: 0.5rem;">
          You've been invited to join <strong>${boardName}</strong>
        </h2>
        <p style="color: #6b7280; font-size: 0.9rem; margin-bottom: 1.5rem;">
          ${senderName || 'A team member'} has invited you to collaborate on this project.
        </p>
        <a href="${inviteUrl}"
           style="display: inline-block; background: #c9a96e; color: #fff; text-decoration: none;
                  padding: 0.75rem 1.5rem; border-radius: 10px; font-weight: 600; font-size: 0.95rem;">
          Accept invitation →
        </a>
        <p style="margin-top: 1.5rem; font-size: 0.75rem; color: #c4bfb9;">
          Or copy this link: <a href="${inviteUrl}" style="color: #c9a96e;">${inviteUrl}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #E8E5E0; margin: 1.5rem 0;" />
        <p style="font-size: 0.7rem; color: #c4bfb9;">
          Powered by task — omercimen.com
        </p>
      </div>
    `,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
