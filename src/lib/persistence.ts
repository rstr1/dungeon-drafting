import type { RoomTemplate } from '../algorithms/types'

// Snapshot of everything required to reproduce a dungeon
export type ProjectConfig = {
    version: 1
    algorithmId: string
    params: Record<string, number | boolean>
    colours: {
        fill: string
        line: string
    }
    roomTemplates: RoomTemplate[]
}

const CURRENT_VERSION = 1

function serialiseConfig(config: Omit<ProjectConfig, 'version'>): ProjectConfig {
    return { version: CURRENT_VERSION, ...config }
}

// Browser download for config as JSON file
export function exportConfig(config: Omit<ProjectConfig, 'version'>, filename = 'dungeon-drafting-preset.json') {
    const payload = serialiseConfig(config)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

// Reads a File and parses it as a ProjectConfig
export async function importConfig(file: File): Promise<ProjectConfig> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON!')
  }
  if (!isProjectConfig(parsed)) {
    throw new Error('This file is missing required dungeon-drafting preset fields.')
  }
  return parsed
}

function isProjectConfig(value: unknown): value is ProjectConfig {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.algorithmId    === 'string' &&
    typeof v.params         === 'object' &&     v.params !== null &&
    typeof v.colours        === 'object' &&     v.colours !== null &&
    Array.isArray(v.roomTemplates)
  )
}