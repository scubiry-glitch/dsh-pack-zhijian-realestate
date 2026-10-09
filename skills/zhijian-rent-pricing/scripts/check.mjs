#!/usr/bin/env node
import { evaluateRentPricing } from '../../../checks/rent-pricing-checker.mjs'

let raw = ''
for await (const part of process.stdin) {
  raw += part
  if (Buffer.byteLength(raw) > 40 * 1024 * 1024) throw new Error('input limit')
}
const input = JSON.parse(raw)
const allowed = ['rent-pricing-template-binding', 'rent-pricing-output-sanity']
if (input.protocolVersion !== 1 || !Array.isArray(input.resultIds) ||
    input.resultIds.length !== allowed.length || !allowed.every(id => input.resultIds.includes(id))) {
  throw new Error('declared check/result mismatch')
}
process.stdout.write(JSON.stringify(evaluateRentPricing(input)))
