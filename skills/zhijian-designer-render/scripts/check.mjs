#!/usr/bin/env node
import { runSelectedChecks } from '../../../checks/runner.mjs'
let raw = ''
for await (const part of process.stdin) { raw += part; if (Buffer.byteLength(raw) > 40 * 1024 * 1024) throw new Error('input limit') }
const input = JSON.parse(raw)
const allowed = ["report-craft-pdf-structure", "report-craft-format-consistency", "report-craft-browser"]
if (input.protocolVersion !== 1 || !Array.isArray(input.resultIds) || input.resultIds.length !== allowed.length || !allowed.every(id => input.resultIds.includes(id))) throw new Error('declared check/result mismatch')
const results = await runSelectedChecks(input)
process.stdout.write(JSON.stringify(results))
