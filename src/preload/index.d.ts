import type { SideAAPI } from '@shared/types'

declare global {
  interface Window {
    sideA: SideAAPI
  }
}

export {}
