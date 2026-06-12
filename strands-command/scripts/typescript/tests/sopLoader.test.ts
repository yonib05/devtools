import { describe, it, expect, beforeEach } from 'vitest'
import { loadSop, scorerRubric } from '../src/prompts/sopLoader'

describe('loadSop', () => {
  beforeEach(() => { delete process.env.STRANDS_TS_AGENTS })

  it('loads the default SOP for a lens', () => {
    const sop = loadSop('bug', 'lenses/bug.sop.md')
    expect(sop).toContain('BUG reviewer')
    expect(sop).toContain('JSON')
  })

  it('user config sop override wins', () => {
    process.env.STRANDS_TS_AGENTS = '{"bug":{"sop":"lenses/test.sop.md"}}'
    expect(loadSop('bug', 'lenses/bug.sop.md')).toContain('TEST reviewer')
  })

  it('rejects path traversal in overrides', () => {
    process.env.STRANDS_TS_AGENTS = '{"bug":{"sop":"../../package.json"}}'
    expect(() => loadSop('bug', 'lenses/bug.sop.md')).toThrow(/escapes/)
  })

  it('rubric covers all bands', () => {
    for (const band of ['0', '25', '50', '75', '100']) expect(scorerRubric()).toContain(band)
  })
})
