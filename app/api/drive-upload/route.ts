import { NextRequest, NextResponse } from 'next/server'

// Server-side proxy to Google Apps Script — avoids browser CORS restrictions
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { scriptUrl, fileName, data, folder } = body

    if (!scriptUrl) {
      return NextResponse.json({ error: 'No scriptUrl provided' }, { status: 400 })
    }

    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, data, folder }),
      redirect: 'follow',
    })

    const text = await res.text()
    try {
      return NextResponse.json(JSON.parse(text))
    } catch {
      return NextResponse.json({ success: true })
    }
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
