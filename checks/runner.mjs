/** Package-owned adapter. Host alone validates the frozen pack and issues authoritative receipts. */
import { createHash } from 'node:crypto'
import { evaluateReportCraftV2 } from './report-craft-checker-v2.mjs'

export async function runSelectedChecks(input) {
  if (input.protocolVersion !== 1 || !Array.isArray(input.selections) || !Array.isArray(input.resultIds)) throw new Error('invalid craft runner protocol')
  const rendered = input.selections.find(row => row.skillId === 'zhijian-designer-render')
  const style = rendered?.variant ?? 'credit-policy'
  if (!['credit-policy', 'designer-paper'].includes(style)) throw new Error('unknown domain-owned render variant')
  const roles = ['md', 'html', 'pdf', 'evidence']
  const artifacts = roles.map(role => {
    const row = input.artifacts?.[role]
    if (!row || typeof row.id !== 'string' || typeof row.content !== 'string') throw new Error('missing artifact role')
    return row
  })
  // This internal adapter preserves the tested inspector's input shape. The
  // Host v3 receipt binds the real selected-domain contract, never this adapter ID.
  const results = await evaluateReportCraftV2(artifacts, {
    id: 'zhijian-report-craft-core-v2', md: artifacts[0].id, html: artifacts[1].id,
    pdf: artifacts[2].id, craftEvidence: artifacts[3].id,
    materialPackId: 'zhijian-report-craft-v2',
    materialDigest: createHash('sha256').update(JSON.stringify(input.selections)).digest('hex'), style,
  }, { browserExecutablePath: input.host?.browserExecutablePath })
  return input.resultIds.map(id => {
    const result = results.find(row => row.id === id)
    if (!result) throw new Error('declared result missing from domain inspector')
    return result
  })
}
