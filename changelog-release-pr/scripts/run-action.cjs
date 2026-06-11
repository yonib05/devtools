// github-script entry: assumes `github` (Octokit), `context`, and `core` are
// provided by actions/github-script (same convention as process-input.cjs).
// Builds a real client + fs ops and delegates to run.cjs. Inputs come from env
// (set by the composite action): SOURCE_REPO, MODE, TAG, TARGET_DIR.

const fs = require('fs')
const path = require('path')
const { run } = require('./run.cjs')

function splitRepo(full) {
  const [owner, repo] = full.split('/')
  return { owner, repo }
}

async function runAction(github, context, core) {
  const sourceRepo = process.env.SOURCE_REPO
  const mode = process.env.MODE === 'backfill' ? 'backfill' : 'single'
  const tag = process.env.TAG || undefined
  const targetDir = process.env.TARGET_DIR

  const client = {
    listReleases: async (repoFull) => {
      const { owner, repo } = splitRepo(repoFull)
      return github.paginate(github.rest.repos.listReleases, { owner, repo, per_page: 100 })
    },
    getRelease: async (repoFull, t) => {
      const { owner, repo } = splitRepo(repoFull)
      try {
        const res = await github.rest.repos.getReleaseByTag({ owner, repo, tag: t })
        return res.data
      } catch (e) {
        if (e.status === 404) return null
        throw e
      }
    },
    getPr: async (repoFull, num) => {
      const { owner, repo } = splitRepo(repoFull)
      try {
        const res = await github.rest.pulls.get({ owner, repo, pull_number: num })
        const pr = res.data
        return {
          labels: (pr.labels || []).map((l) => l.name),
          merge_commit_sha: pr.merge_commit_sha,
          user: pr.user ? pr.user.login : null,
        }
      } catch (e) {
        if (e.status === 404) return null
        throw e
      }
    },
  }

  const result = await run({
    repo: sourceRepo,
    mode,
    tag,
    client,
    readExisting: async (p) => {
      try {
        return fs.readFileSync(path.join(targetDir, p), 'utf8')
      } catch {
        return null
      }
    },
    writeFile: async (p, contents) => {
      const full = path.join(targetDir, p)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, contents)
    },
  })

  core.info(`changelog: wrote ${result.written.length} file(s)`)
  for (const w of result.warnings) core.warning(w)
  // Expose for the PR body.
  core.setOutput('written_count', String(result.written.length))
  core.setOutput('warnings', result.warnings.join('\n'))
  return result
}

module.exports = runAction
