import { type Profile } from './types'

const STORAGE_KEY = 'user_profile_v1'

export function getLocalProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Profile
  } catch {
    return null
  }
}

export function saveLocalProfile(profile: Profile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch { /* ignore */ }
}

export function generateProfileId(): string {
  return crypto.randomUUID()
}
