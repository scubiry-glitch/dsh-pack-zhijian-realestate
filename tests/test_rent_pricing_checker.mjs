import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { evaluateRentPricing } from '../checks/rent-pricing-checker.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const md = Buffer.from('# 租金报告\n')
const html = Buffer.from('<h1>租金报告</h1><main id="report-body">' +
  Array.from({ length: 8 }, (_, i) => `<section class="card anchor" id="s${i + 1}"><h2>第${i + 1}章</h2></section>`).join('') +
  '<p>同质可比 单位面积 替代品 底价（测算硬底） 三档定价共用横轴</p><h3>来源</h3></main>')
const pdf = Buffer.from('%PDF-' + 'x'.repeat(1001))
const ledger = {
  template: 'rent-pricing-detailed-v3', dataSha256: 'a'.repeat(64),
  mdSha256: hash(md), htmlSha256: hash(html), pdfSha256: hash(pdf),
  comparableCount: 0, calculationStepCount: 0, trendLevel: 'city',
  trendPointCount: 0, independentReview: 'required',
}

function check(evidence) {
  const bytes = Buffer.from(JSON.stringify(evidence))
  return evaluateRentPricing({ artifacts: {
    md: { content: md.toString(), sha256: hash(md) },
    html: { content: html.toString(), sha256: hash(html) },
    pdf: { content: pdf.toString('base64'), encoding: 'base64', sha256: hash(pdf) },
    evidence: { content: bytes.toString(), sha256: hash(bytes) },
  } })
}

const allPassed = results => results.every(row => row.status === 'passed')
const allFailed = results => results.every(row => row.status === 'failed')

test('accepts the renderer ledger and a consistent publication wrapper', () => {
  assert.ok(allPassed(check(ledger)))
  assert.ok(allPassed(check({
    ledger, data: { sha256: ledger.dataSha256 },
    outputs: ['md', 'html', 'pdf'].map(role => ({ role, sha256: ledger[role + 'Sha256'] })),
    independentReview: 'required',
  })))
})

test('rejects conflicting wrapper claims and published bytes', () => {
  assert.ok(allFailed(check({ ledger, mdSha256: 'b'.repeat(64) })))
  assert.ok(allFailed(check({ ledger, data: { sha256: 'b'.repeat(64) } })))
  assert.ok(allFailed(check({ ledger, outputs: [
    { role: 'md', sha256: ledger.mdSha256 },
    { role: 'html', sha256: ledger.htmlSha256 },
    { role: 'pdf', sha256: 'b'.repeat(64) },
  ] })))
  assert.equal(check({ ...ledger, pdfSha256: 'b'.repeat(64) })[0].status, 'failed')
})
