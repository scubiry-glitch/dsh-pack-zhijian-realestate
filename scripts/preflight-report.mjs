#!/usr/bin/env node
/** Local diagnostic only. The installed Host independently verifies its frozen contract. */
import { createHash } from 'node:crypto'
import { readFile, lstat, realpath } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const hash = raw => createHash('sha256').update(raw).digest('hex')
const need = (ok, message) => { if (!ok) throw new Error(message) }

async function snapshot(path, max) {
  need(isAbsolute(path), 'artifact and selection paths must be absolute')
  const before = await lstat(path)
  need(before.isFile() && !before.isSymbolicLink() && before.size <= max, 'input must be a bounded regular file')
  const physical = await realpath(path)
  const bytes = await readFile(path)
  const after = await lstat(path)
  need(before.ino === after.ino && before.dev === after.dev && before.mtimeMs === after.mtimeMs && bytes.length === after.size, 'input changed during read')
  return { path, physical, ino: before.ino, dev: before.dev, sha256: hash(bytes), bytes }
}

async function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('node scripts/preflight-report.mjs --md /abs/report.md --html /abs/report.html --pdf /abs/report.pdf --ledger /abs/craft-evidence.json --selections /abs/selections.json')
    return 0
  }
  const values = {}
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]
    need(['--md', '--html', '--pdf', '--ledger', '--selections'].includes(key) && !values[key] && typeof args[i + 1] === 'string', 'invalid or duplicate arguments; use --help')
    values[key] = args[i + 1]
  }
  need(Object.keys(values).length === 5, 'all four artifact roles and selections are required')
  const pack = JSON.parse(await readFile(join(root, 'pack.json'), 'utf8'))
  const selectionFile = await snapshot(values['--selections'], 32 * 1024)
  const selections = JSON.parse(selectionFile.bytes.toString('utf8'))
  need(Array.isArray(selections) && selections.length > 0 && selections.length <= 8, 'selections must contain 1..8 explicitly chosen skills')
  const declarations = []
  const chosen = new Set()
  for (const selection of selections) {
    need(selection && selection.packId === pack.id && typeof selection.skillId === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(selection.skillId)
      && typeof selection.reason === 'string' && selection.reason.trim(), 'invalid selected pack/skill identity or missing reason')
    need(!chosen.has(selection.skillId), 'duplicate selected skill')
    chosen.add(selection.skillId)
    const declaration = JSON.parse(await readFile(join(root, 'craft', `${selection.skillId}.json`), 'utf8'))
    if (declaration.variants) need(typeof selection.variant === 'string' && Object.hasOwn(declaration.variants, selection.variant), 'choose a declared variant')
    else need(selection.variant === undefined, 'skill does not declare variants')
    declarations.push(declaration)
  }
  for (const declaration of declarations) {
    need((declaration.requires ?? []).every(id => chosen.has(id)), 'required skills must be explicitly selected')
    need(!(declaration.conflicts ?? []).some(id => chosen.has(id)), 'conflicting selected skills')
  }
  const resultIds = declarations.flatMap(row => row.checks.flatMap(check => check.resultIds))
  need(resultIds.length > 0 && new Set(resultIds).size === resultIds.length, 'duplicate or empty declared results')
  const roles = ['md', 'html', 'pdf', 'evidence']
  const paths = ['--md', '--html', '--pdf', '--ledger'].map(key => values[key])
  const limits = [2, 2, 20, .25].map(mb => mb * 1024 * 1024)
  const files = await Promise.all(paths.map((path, i) => snapshot(path, limits[i])))
  need(new Set(files.map(row => row.physical)).size === 4 && new Set(files.map(row => `${row.dev}:${row.ino}`)).size === 4, 'four distinct artifact files required')
  const artifacts = Object.fromEntries(files.map((file, i) => [roles[i], {
    id: roles[i], sha256: file.sha256,
    content: file.bytes.toString(i === 2 ? 'base64' : 'utf8'), encoding: i === 2 ? 'base64' : 'utf8',
  }]))
  const { runSelectedChecks } = await import('../checks/runner.mjs')
  const results = await runSelectedChecks({ protocolVersion: 1, selections, resultIds, artifacts, host: {} })
  const allInputs = [...files, selectionFile]
  for (const file of allInputs) {
    const after = await snapshot(file.path, file.bytes.length)
    need(after.physical === file.physical && after.dev === file.dev && after.ino === file.ino && after.sha256 === file.sha256, 'input changed during checks')
  }
  const status = results.some(row => row.status === 'failed') ? 'failed' : results.some(row => row.status !== 'passed') ? 'unverified' : 'passed'
  console.log(JSON.stringify({ status, packId: pack.id, packVersion: pack.version, selections,
    hostReceipt: false, qualityApproved: false, inputFilesUnchanged: true,
    artifacts: files.map((file, i) => ({ role: roles[i], path: file.physical, sha256: file.sha256 })), results }))
  return status === 'passed' ? 0 : status === 'failed' ? 1 : 2
}

try { process.exitCode = await main(process.argv.slice(2)) }
catch (error) {
  console.log(JSON.stringify({ status: 'unverified', hostReceipt: false, qualityApproved: false, error: String(error).slice(0, 2000) }))
  process.exitCode = 2
}
