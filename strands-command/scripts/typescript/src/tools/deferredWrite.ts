import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export const ARTIFACT_PATH = '.artifact/write_operations.jsonl'

export interface WriteOperation {
  timestamp: string
  function: string
  kwargs: Record<string, unknown>
}

export interface WriteMode {
  write: boolean
}

export function writeEnabled(): WriteMode {
  return { write: process.env.GITHUB_WRITE === 'true' }
}

export async function recordOrCall<T>(
  mode: WriteMode,
  fnName: string,
  kwargs: Record<string, unknown>,
  call: () => Promise<T>,
): Promise<T | string> {
  if (mode.write) return call()
  const entry: WriteOperation = {
    timestamp: new Date().toISOString(),
    function: fnName,
    kwargs,
  }
  mkdirSync(dirname(ARTIFACT_PATH), { recursive: true })
  appendFileSync(ARTIFACT_PATH, JSON.stringify(entry) + '\n')
  return `Operation deferred: ${fnName}`
}
