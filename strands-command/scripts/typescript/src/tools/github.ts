// src/tools/github.ts
import { tool } from '@strands-agents/sdk'
import { z } from 'zod'
import { recordOrCall, type WriteMode } from './deferredWrite.js'

function repoOrEnv(repo?: string): string {
  const r = repo ?? process.env.GITHUB_REPOSITORY
  if (!r) throw new Error('GITHUB_REPOSITORY not set')
  return r
}

async function githubRequest(
  method: string,
  endpoint: string,
  repo?: string,
  body?: unknown,
): Promise<unknown> {
  const r = repoOrEnv(repo)
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN not set')
  const res = await fetch(`https://api.github.com/repos/${r}/${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`GitHub ${method} ${endpoint} failed: ${res.status}`)
  return res.json()
}

// Indirection seam for tests: ESM namespace exports are sealed, so tests spy on
// this object's property instead of the module binding. All internal calls go
// through _http.request.
export const _http = { request: githubRequest }

// ---- Read helpers ----
export async function getPrComments(prNumber: number, repo?: string): Promise<string> {
  const data = await _http.request('GET', `issues/${prNumber}/comments?per_page=100`, repo, undefined)
  return JSON.stringify(data)
}

export async function getPrDiffRaw(prNumber: number, repo?: string): Promise<string> {
  const data = await _http.request('GET', `pulls/${prNumber}/files?per_page=100`, repo, undefined)
  return JSON.stringify(data)
}

export async function getFileContentsRaw(path: string, ref: string, repo?: string): Promise<string> {
  const safePath = path.split('/').map(encodeURIComponent).join('/')
  const data = await _http.request('GET', `contents/${safePath}?ref=${encodeURIComponent(ref)}`, repo, undefined)
  return JSON.stringify(data)
}

export async function getFileHistoryRaw(path: string, repo?: string): Promise<string> {
  // Recent commits touching this file — the history lens's data source
  // (no shell/git in the TS runner; history comes from the API).
  const data = await _http.request('GET', `commits?path=${encodeURIComponent(path)}&per_page=20`, repo, undefined)
  return JSON.stringify(data)
}

// ---- Write fn (shared by agent tool + writeExecutor) ----
export interface AddPrCommentArgs {
  prNumber: number
  body: string
  path?: string
  line?: number
  startLine?: number
  repo?: string
}

export async function addPrComment(mode: WriteMode, args: AddPrCommentArgs): Promise<string> {
  return recordOrCall(mode, 'addPrComment', { ...args }, async () => {
    const endpoint = args.path
      ? `pulls/${args.prNumber}/comments`
      : `issues/${args.prNumber}/comments`
    const body: Record<string, unknown> = { body: args.body }
    if (args.path) {
      body.path = args.path
      body.line = args.line
      body.side = 'RIGHT'
      if (args.startLine !== undefined) {
        body.start_line = args.startLine
        body.start_side = 'RIGHT'
      }
    }
    const res = await _http.request('POST', endpoint, args.repo, body)
    return JSON.stringify(res)
  }) as Promise<string>
}

// ---- Agent-facing tool() wrappers (read-only; agent never posts directly) ----
export function readTools(repo: string) {
  return [
    tool({
      name: 'get_pr_diff',
      description: 'Get the list of changed files and their diffs for a PR.',
      inputSchema: z.object({ prNumber: z.number().int() }),
      callback: async (input) => getPrDiffRaw(input.prNumber, repo),
    }),
    tool({
      name: 'get_file_contents',
      description: 'Get the full contents of a file at a git ref.',
      inputSchema: z.object({ path: z.string(), ref: z.string() }),
      callback: async (input) => getFileContentsRaw(input.path, input.ref, repo),
    }),
    tool({
      name: 'get_pr_comments',
      description: 'Get existing comments on a PR.',
      inputSchema: z.object({ prNumber: z.number().int() }),
      callback: async (input) => getPrComments(input.prNumber, repo),
    }),
    tool({
      name: 'get_file_history',
      description: 'Get recent commits (messages, authors, dates) that touched a file.',
      inputSchema: z.object({ path: z.string() }),
      callback: async (input) => getFileHistoryRaw(input.path, repo),
    }),
  ]
}
