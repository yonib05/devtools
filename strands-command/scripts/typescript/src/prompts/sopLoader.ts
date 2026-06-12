// src/prompts/sopLoader.ts
import { readFileSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { agentOverrides } from '../models.js'

const SOP_DIR = fileURLToPath(new URL('../../sops/', import.meta.url))

/** Load an agent's SOP: user-override path (relative to sops/, traversal-safe) or the default. */
export function loadSop(agentKey: string, defaultRelPath: string): string {
  const override = agentOverrides()[agentKey]?.sop
  const rel = override ?? defaultRelPath
  const full = normalize(join(SOP_DIR, rel))
  if (!full.startsWith(normalize(SOP_DIR))) {
    throw new Error(`SOP path escapes sops/ dir: ${rel}`)
  }
  return readFileSync(full, 'utf8')
}

export function scorerRubric(): string {
  return (
    '0: false positive/pre-existing. 25: maybe real, unverified. 50: verified but nitpick/infrequent. ' +
    '75: verified, impactful, or doc-mandated. 100: certain, frequent, evidence confirms.'
  )
}
