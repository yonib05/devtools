import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, rmSync, readFileSync } from 'node:fs'
import { ARTIFACT_PATH } from '../src/tools/deferredWrite'

vi.mock('../src/agents/orchestrator', () => ({
  buildOrchestrator: vi.fn(),
}))

import { buildOrchestrator } from '../src/agents/orchestrator'
import { runReviewer } from '../src/modes/reviewer'

const ctx = { prNumber: 7, repo: 'o/r', headSha: 'abc123' }

function mockAgent(structuredOutput: unknown) {
  return { invoke: vi.fn().mockResolvedValue({ structuredOutput }) }
}

describe('runReviewer', () => {
  beforeEach(() => {
    process.env.GITHUB_WRITE = 'false'
    if (existsSync(ARTIFACT_PATH)) rmSync(ARTIFACT_PATH)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.GITHUB_WRITE
    if (existsSync(ARTIFACT_PATH)) rmSync(ARTIFACT_PATH)
  })

  it('defers a formatted comment for valid findings above threshold', async () => {
    vi.mocked(buildOrchestrator).mockReturnValue(mockAgent({
      findings: [{ lens: 'bug', description: 'real bug', file: 'a.ts', line: 3, reason: 'r', score: 95 }],
    }) as any)
    await runReviewer(ctx)
    const line = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8').trim())
    expect(line.function).toBe('addPrComment')
    expect(line.kwargs.body).toContain('real bug')
    expect(line.kwargs.body).toContain('abc123')
  })

  it('defers the designed-silence template when all findings are filtered out', async () => {
    vi.mocked(buildOrchestrator).mockReturnValue(mockAgent({
      findings: [{ lens: 'bug', description: 'weak', file: 'a.ts', line: 3, reason: 'r', score: 40 }],
    }) as any)
    await runReviewer(ctx)
    const line = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8').trim())
    expect(line.kwargs.body).toContain('No issues found')
  })

  it('throws on malformed structured output without deferring anything', async () => {
    vi.mocked(buildOrchestrator).mockReturnValue(mockAgent({ nonsense: true }) as any)
    await expect(runReviewer(ctx)).rejects.toThrow(/structured output/)
    expect(existsSync(ARTIFACT_PATH)).toBe(false)
  })
})
