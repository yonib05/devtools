const { test } = require('node:test')
const assert = require('node:assert/strict')
const { enrichFromPr } = require('./enrich.cjs')

test('extracts areas, commit, author', async () => {
  const fetcher = async (repo, num) => {
    assert.equal(repo, 'strands-agents/harness-sdk')
    assert.equal(num, 2287)
    return {
      labels: ['enhancement', 'python', 'area-model', 'area-otel', 'size/xs'],
      merge_commit_sha: '155239dca769c8eea7652b2496822ea47283a1a9',
      user: 'yatszhash',
    }
  }
  const e = await enrichFromPr('strands-agents/harness-sdk', 2287, fetcher)
  assert.deepEqual(e.areas, ['model', 'otel'])
  assert.equal(e.breaking, false)
  assert.equal(e.commit, '155239d')
  assert.equal(e.author, 'yatszhash')
})

test('detects breaking label', async () => {
  const f = async () => ({ labels: ['breaking change'], merge_commit_sha: 'abcdef0123', user: 'x' })
  const e = await enrichFromPr('r', 1, f)
  assert.equal(e.breaking, true)
})

test('missing pr degrades gracefully (fetcher returns null)', async () => {
  const f = async () => null
  const e = await enrichFromPr('r', 1, f)
  assert.deepEqual(e, { areas: [], breaking: false, commit: null, author: null })
})

test('no merge sha yields null commit', async () => {
  const f = async () => ({ labels: [], merge_commit_sha: null, user: null })
  const e = await enrichFromPr('r', 1, f)
  assert.equal(e.commit, null)
  assert.equal(e.author, null)
})
