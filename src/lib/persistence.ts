import type { RoomTemplate } from '../algorithms/types'
import type { Palette } from './palette'

// Snapshot of everything required to reproduce a dungeon
export type ProjectConfig = {
    algorithmId: string
    params: Record<string, number | boolean>
    palette: Palette
    roomTemplates: RoomTemplate[]
}

// Download for config as JSON file
export function exportConfig(config: ProjectConfig, filename = 'dungeon-drafting-preset.json') {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
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
    typeof v.palette        === 'object' &&     v.palette !== null &&
    Array.isArray(v.roomTemplates)
  )
}