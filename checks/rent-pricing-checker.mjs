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
    const detailed = ledger.template === 'rent-pricing-detailed-v3'
    const bound = ['rent-pricing-shell-v3', 'rent-pricing-detailed-v3'].includes(ledger.template) &&
      ledger.mdSha256 === hash(mdBytes) && ledger.htmlSha256 === hash(htmlBytes) &&
      ledger.pdfSha256 === hash(pdfBytes) &&
      /^[a-f0-9]{64}$/.test(ledger.dataSha256)
    const sections = ['一、结论先行（三档定价）', '二、适用前提与产品形态',
      '三、三种定价参考依据', '四、计算逻辑明细（可复现）',
      '五、可比明细表', '六、近 12 个月社区租金趋势',
      '七、风险与限制', '八、行动建议']
    const order = sections.map(section => page.indexOf('<h2>' + section + '</h2>'))
    const detailedOrder = Array.from({length: 8}, (_, i) => page.indexOf(`<section class="card anchor" id="s${i + 1}">`))
    const ordered = detailed ? detailedOrder.every((position, index) => position >= 0 && (index === 0 || position > detailedOrder[index - 1])) &&
      (page.match(/<h2>/g) ?? []).length === 8 :
      order.every((position, index) => position >= 0 && (index === 0 || position > order[index - 1]))
    const methods = detailed ? ['同质可比', '单位面积', '替代品'].every(item => page.includes(item)) :
      page.includes('依据一 · 同质可比法') && page.includes('依据二 · 单位面积租金法') && page.includes('依据三 · 替代品锚定法')
    const sources = detailed ? page.includes('<h3>来源</h3>') : page.includes('证据入口')
    const trendLabel = detailed ?
      (ledger.trendLevel === 'community' ? '小区' : ledger.trendLevel === 'business_circle' ? '商圈' : '城市') : '社区'
    const structure = (page.match(/<h1\b/g) ?? []).length === 1 &&
      page.includes('id="report-body"') &&
      ordered && methods && sources &&
      !/[〔〕]/.test(page + md) &&
      !/<(?:script|iframe|img)\b/i.test(page) &&
      !/\b(?:src|href)=["']https?:\/\//i.test(page) &&
      (ledger.comparableCount === 0 || page.includes('aria-label="可比样本月租价格分布"')) &&
      (ledger.trendPointCount === 0 || page.includes(`aria-label="近 12 个月${trendLabel}租金趋势"`)) &&
      (!detailed || (page.includes('底价（测算硬底）') && page.includes('三档定价共用横轴') &&
        (ledger.trendPointCount === 0 || (page.includes('四项趋势计算') &&
          (page.match(/class="box trend-metric"/g) ?? []).length === 4)))) &&
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
