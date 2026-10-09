/** Small mechanical check; the independent reviewer remains responsible for facts. */
import { createHash } from 'node:crypto'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const result = (id, ok, detail) => ({ id, status: ok ? 'passed' : 'failed', detail })
const role = (artifacts, key, max) => {
  const item = artifacts?.[key]
  if (!item || typeof item.content !== 'string') throw new Error('missing ' + key)
  const bytes = Buffer.from(item.content, item.encoding === 'base64' ? 'base64' : 'utf8')
  if (bytes.length > max || (item.sha256 && hash(bytes) !== item.sha256)) throw new Error('invalid ' + key + ' bytes')
  return bytes
}

export function evaluateRentPricing(input) {
  const ids = ['rent-pricing-template-binding', 'rent-pricing-output-sanity']
  try {
    const mdBytes = role(input.artifacts, 'md', 2 * 1024 * 1024)
    const htmlBytes = role(input.artifacts, 'html', 2 * 1024 * 1024)
    const pdfBytes = role(input.artifacts, 'pdf', 20 * 1024 * 1024)
    const ledgerBytes = role(input.artifacts, 'evidence', 256 * 1024)
    const md = mdBytes.toString('utf8'), page = htmlBytes.toString('utf8')
    const ledger = JSON.parse(ledgerBytes.toString('utf8'))
    const bound = ledger.template === 'rent-pricing-shell-v2' &&
      ledger.mdSha256 === hash(mdBytes) && ledger.htmlSha256 === hash(htmlBytes) &&
      ledger.pdfSha256 === hash(pdfBytes) &&
      /^[a-f0-9]{64}$/.test(ledger.dataSha256)
    const structure = (page.match(/<h1\b/g) ?? []).length === 1 &&
      page.includes('id="report-body"') &&
      page.includes('结论先行：三档价格如何用') &&
      page.includes('样本如何约束价格') &&
      page.includes('证据入口') &&
      !/[〔〕]/.test(page + md) &&
      !/<(?:script|iframe|img)\b/i.test(page) &&
      !/\b(?:src|href)=["']https?:\/\//i.test(page) &&
      (ledger.comparableCount === 0 || page.includes('aria-label="可比样本月租价格分布"')) &&
      pdfBytes.subarray(0, 5).toString() === '%PDF-' &&
      pdfBytes.length > 1000
    return [
      result(ids[0], bound, bound ? 'MD/HTML both bind to one template data digest' : 'template data or artifact hash mismatch'),
      result(ids[1], structure, structure ? 'single title, data chart when available, sources and PDF present' : 'template output structure or PDF missing'),
    ]
  } catch (error) {
    return ids.map(id => result(id, false, 'invalid rent-pricing input: ' + String(error).slice(0, 220)))
  }
}
