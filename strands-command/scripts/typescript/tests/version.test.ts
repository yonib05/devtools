import { describe, it, expect } from 'vitest'
import { RUNNER_NAME } from '../src/version'

describe('version', () => {
  it('exposes the runner name', () => {
    expect(RUNNER_NAME).toBe('strands-ts')
  })
})
