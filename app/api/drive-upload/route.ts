import { NextRequest, NextResponse } from 'next/server'

// Server-side proxy to Google Apps Script — avoids browser CORS restrictions
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { scriptUrl, fileName, data, folder, parentFolderId } = body

    if (!scriptUrl) {
      return NextResponse.json({ error: 'No scriptUrl provided' }, { status: 400 })
    }

    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, data, folder, parentFolderId }),
      redirect: 'follow',
    })

    const text = await res.text()
    try {
      const json = JSON.parse(text)
      return NextResponse.json(json)
    } catch {
      // Non-JSON response — usually an auth redirect or Apps Script error page.
      // This is a real failure; do NOT report success.
      console.error('Drive upload: non-JSON response from Apps Script:', text.slice(0, 300))
      return NextResponse.json({
        success: false,
        error: 'Apps Script returned a non-JSON response. Check that the script is deployed as a Web App with "Anyone" access and the URL is correct.',
        raw: text.slice(0, 200),
      })
    }
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
