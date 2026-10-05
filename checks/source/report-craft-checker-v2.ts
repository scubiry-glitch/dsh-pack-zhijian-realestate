/** Versioned, bounded report checks. Never certifies general mathematics or semantics. */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { isAbsolute } from 'node:path'
import type { ArtifactEvidence, ArtifactCheckResult, ReportCraftV2Check } from './types.ts'
import { evaluateReportCraft } from './report-craft-checker.ts'
import { REPORT_CRAFT_V2_PYTHON } from './report-craft-checker-v2-helper.ts'

export { REPORT_CRAFT_V2_CHECKER_VERSION } from './version.ts'
import { REPORT_CRAFT_V2_CHECKER_VERSION } from './version.ts'
export const REPORT_CRAFT_V2_DEFAULT_BROWSER = '/root/.cache/dsh-report-craft/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell'
export interface ReportCraftV2Options {
  /** Trusted Host configuration only; never accepted from the artifact/ledger. */
  readonly browserExecutablePath?: string
  readonly signal?: AbortSignal
}
const EXTRA_IDS = ['report-craft-chapter-structure', 'report-craft-calculations', 'report-craft-format-consistency', 'report-craft-browser', 'report-craft-policy-evidence'] as const
const ALL_IDS = ['report-craft-source-disclosure', 'report-craft-closing-structure', 'report-craft-pdf-structure', ...EXTRA_IDS] as const
const MAX_OUTPUT = 128 * 1024
const MAX_DETAIL = 16_000
function results(status: ArtifactCheckResult['status'], detail: string, ids: readonly ArtifactCheckResult['id'][] = ALL_IDS): ArtifactCheckResult[] {
  return ids.map(id => ({ id, status, detail }))
}
function bytes(artifacts: readonly ArtifactEvidence[], id: string, max: number): Buffer {
  const matches = artifacts.filter(a => a.id === id)
  if (matches.length !== 1) throw new Error('binding must resolve exactly one artifact: ' + id)
  const a = matches[0]!
  if (typeof a.content !== 'string' || a.content.length > max * 2) throw new Error('artifact content size limit exceeded')
  if (a.encoding !== undefined && a.encoding !== 'base64' && a.encoding !== 'utf8') throw new Error('unsupported artifact encoding')
  if (a.encoding === 'base64' && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.content)) throw new Error('invalid base64')
  const b = Buffer.from(a.content, a.encoding === 'base64' ? 'base64' : 'utf8')
  if (b.length > max || createHash('sha256').update(b).digest('hex') !== a.sha256) throw new Error('artifact bytes/hash mismatch')
  return b
}

export async function evaluateReportCraftV2(artifacts: readonly ArtifactEvidence[], check: ReportCraftV2Check, options: ReportCraftV2Options = {}): Promise<ArtifactCheckResult[]> {
  if (options.signal?.aborted) return results('unverified', 'Inspection cancelled before start')
  let input: string
  try {
    if (check.id !== 'zhijian-report-craft-core-v2' || check.materialPackId !== 'zhijian-report-craft-v2' || !/^[a-f0-9]{64}$/.test(check.materialDigest) || !['credit-policy', 'designer-paper'].includes(check.style)) throw new Error('invalid v2 material/check binding')
    if (new Set([check.md, check.html, check.pdf, check.craftEvidence]).size !== 4) throw new Error('four distinct artifact IDs required')
    const md = bytes(artifacts, check.md, 2 * 1024 * 1024), html = bytes(artifacts, check.html, 2 * 1024 * 1024), pdf = bytes(artifacts, check.pdf, 20 * 1024 * 1024), ledger = bytes(artifacts, check.craftEvidence, 256 * 1024)
    const decoder = new TextDecoder('utf-8', { fatal: true })
    const browser = options.browserExecutablePath ?? REPORT_CRAFT_V2_DEFAULT_BROWSER
    if (!isAbsolute(browser) || browser.includes('\0')) throw new Error('Host browser path must be absolute')
    input = JSON.stringify({ md: decoder.decode(md), html: decoder.decode(html), pdf: pdf.toString('base64'), ledger: decoder.decode(ledger), hashes: { md: createHash('sha256').update(md).digest('hex'), html: createHash('sha256').update(html).digest('hex'), pdf: createHash('sha256').update(pdf).digest('hex') }, browser, checkerVersion: REPORT_CRAFT_V2_CHECKER_VERSION })
  } catch (e) {
    return results('failed', 'V2 input invalid: ' + (e instanceof Error ? e.message : 'invalid input'))
  }
  // V1 retains its historical meaning. Wait for both helpers to settle, including
  // cancellation, so a caller never receives a result while our children run on.
  const old = evaluateReportCraft(artifacts, { id: 'zhijian-report-craft-core-v1', md: check.md, html: check.html, pdf: check.pdf })
  const extra = new Promise<ArtifactCheckResult[]>(resolve => {
    let done = false, output = '', size = 0
    const child = spawn('python3', ['-I', '-c', REPORT_CRAFT_V2_PYTHON], { shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] })
    const stop = () => {
      try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL') } catch { /* already settled */ }
    }
    const finish = (value: ArtifactCheckResult[]) => {
      if (done) return
      done = true; clearTimeout(timer); options.signal?.removeEventListener('abort', abort); stop(); resolve(value)
    }
    let pendingFailure: string | undefined
    const abort = () => { pendingFailure = 'V2 inspection cancelled'; stop() }
    const timer = setTimeout(() => { pendingFailure = 'V2 inspection exceeded 30-second resource limit'; stop() }, 30_000)
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) abort()
    child.on('error', () => finish(results('unverified', 'Isolated Python v2 inspector unavailable', EXTRA_IDS)))
    child.stdin.on('error', () => {})
    child.stderr.on('data', () => {}) // Never leak report text through exception diagnostics.
    child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > MAX_OUTPUT) { pendingFailure = 'V2 inspector output limit exceeded'; stop() } else output += chunk.toString('utf8') })
    child.on('close', code => {
      if (pendingFailure) return finish(results('unverified', pendingFailure, EXTRA_IDS))
      if (code !== 0) return finish(results('unverified', 'Isolated v2 inspector did not complete', EXTRA_IDS))
      try {
        const value: unknown = JSON.parse(output)
        if (!Array.isArray(value) || value.length !== EXTRA_IDS.length || value.some((r, i) => !r || r.id !== EXTRA_IDS[i] || !['passed', 'failed', 'unverified'].includes(r.status) || typeof r.detail !== 'string' || r.detail.length > MAX_DETAIL)) throw new Error('invalid results')
        finish(value as ArtifactCheckResult[])
      } catch { finish(results('unverified', 'V2 inspector returned invalid results', EXTRA_IDS)) }
    })
    child.stdin.end(input)
  })
  const [v1, v2] = await Promise.all([old, extra])
  return [...v1, ...v2]
}
