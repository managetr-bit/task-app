'use client'

// v2 landing — identical to v1 but routes to /v2/[boardId]
// We re-export the v1 landing page logic with a version override by simply
// rendering the main landing with activeVersion pre-set to 'v2'.
// Since LandingPage's version tab is client state we just redirect there.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LandingV2() {
  const router = useRouter()
  useEffect(() => {
    // Redirect to landing page with v2 tab pre-selected via hash
    router.replace('/?v=2')
  }, [router])
  return null
}
