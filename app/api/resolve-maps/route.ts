import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    return NextResponse.json({ finalUrl: res.url })
  } catch {
    return NextResponse.json({ error: 'Failed to resolve' }, { status: 500 })
  }
}
