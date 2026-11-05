import { create } from 'zustand'

export type AudioSource = 'bandcamp' | 'local'

interface AudioFocusState {
  source: AudioSource | null
  request: (source: AudioSource) => void
  clear: (source: AudioSource) => void
}

/**
 * Only one audio element should be audible at a time. Each player claims focus
 * before it starts and pauses itself when another source takes over.
 */
export const useAudioFocus = create<AudioFocusState>()((set, get) => ({
  source: null,
  request: (source) => set({ source }),
  clear: (source) => {
    if (get().source === source) set({ source: null })
  }
}))

export function requestAudioFocus(source: AudioSource): void {
  useAudioFocus.getState().request(source)
}

export function clearAudioFocus(source: AudioSource): void {
  useAudioFocus.getState().clear(source)
}
