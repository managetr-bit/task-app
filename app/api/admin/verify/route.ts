import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { password } = await req.json()

  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Admin not configured — set ADMIN_PASSWORD env var' }, { status: 503 })
  }

  if (password === process.env.ADMIN_PASSWORD) {
    // Return the password itself as the bearer token.
    // It never appears in the client bundle; it's only returned after a correct guess.
    return NextResponse.json({ ok: true, token: process.env.ADMIN_PASSWORD })
  }

  return NextResponse.json({ ok: false, error: 'Wrong password' }, { status: 401 })
}
