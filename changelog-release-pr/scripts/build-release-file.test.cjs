const { test } = require('node:test')
const assert = require('node:assert/strict')
const { buildReleaseFile } = require('./build-release-file.cjs')

const release = {
  tag_name: 'python/v1.42.0',
  published_at: '2026-06-01T18:18:57Z',
  html_url: 'https://github.com/strands-agents/harness-sdk/releases/tag/python%2Fv1.42.0',
  body: "## What's Changed\n* feat(model): plumb cache tokens by @yatszhash in https://github.com/strands-agents/sdk-python/pull/2287\n",
}

test('produces correct path + parsed/enriched contents', async () => {
  const result = await buildReleaseFile('strands-agents/harness-sdk', release, {
    enrich: async () => ({ areas: ['model'], breaking: false, commit: '155239d', author: 'yatszhash' }),
    readExisting: async () => null,
  })
  assert.equal(result.path, 'site/src/content/changelog/harness/python-v1.42.0.md')
  assert.match(result.contents, /sdk: harness/)
  assert.match(result.contents, /title: "plumb cache tokens"/)
  assert.match(result.contents, /areas: \[model\]/)
  // prUrl/commitUrl use the PR's own repo (sdk-python), not harness-sdk
  assert.match(result.contents, /sdk-python\/pull\/2287/)
  assert.match(result.contents, /sdk-python\/commit\/155239d/)
  assert.equal(result.warning, undefined)
})

test('evals file path + no language', async () => {
  const evalsRelease = {
    tag_name: 'v0.2.1', published_at: '2026-05-29T00:00:00Z',
    html_url: 'https://github.com/strands-agents/evals/releases/tag/v0.2.1',
    body: '* feat: add chaos testing by @x in https://github.com/strands-agents/evals/pull/224\n',
  }
  const r = await buildReleaseFile('strands-agents/evals', evalsRelease, {
    enrich: async () => ({ areas: [], breaking: false, commit: 'aaa1111', author: 'x' }),
    readExisting: async () => null,
  })
  assert.equal(r.path, 'site/src/content/changelog/evals/v0.2.1.md')
  assert.doesNotMatch(r.contents, /\nlanguage:/)
})

test('skips out-of-scope tags', async () => {
  const r = await buildReleaseFile('strands-agents/harness-sdk',
    { ...release, tag_name: 'python-wasm/v0.0.1' },
    { enrich: async () => ({ areas: [], breaking: false, commit: null, author: null }), readExisting: async () => null })
  assert.equal(r, null)
})

test('flags format-drift warning when bullets parse poorly', async () => {
  const drifted = { ...release, body: "## What's Changed\n* updated thing #11\n* fixed thing #12\n* added thing #13\n" }
  const r = await buildReleaseFile('strands-agents/harness-sdk', drifted, {
    enrich: async () => ({ areas: [], breaking: false, commit: null, author: null }),
    readExisting: async () => null,
  })
  assert.ok(r)
  assert.match(r.warning, /parsed 0 of 3/)
})

test('breaking marker promotes type when no conventional type', async () => {
  // a non-conventional line that the PR labels mark breaking → type becomes 'breaking'
  const r = await buildReleaseFile('strands-agents/harness-sdk',
    { ...release, body: '* drop the old api by @x in https://github.com/strands-agents/harness-sdk/pull/1\n' },
    { enrich: async () => ({ areas: [], breaking: true, commit: 'bbb2222', author: 'x' }), readExisting: async () => null })
  assert.match(r.contents, /type: breaking/)
  assert.match(r.contents, /breaking: true/)
})
