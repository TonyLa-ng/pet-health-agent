import { evaluateKnowledgeQuality } from '../src/knowledge/quality-gate'

const strict = process.argv.includes('--strict')
const minimumArg = process.argv.find((arg) => arg.startsWith('--minimum='))
const minimum = minimumArg ? Number(minimumArg.split('=')[1]) : 100
const report = evaluateKnowledgeQuality({ minimumActiveEntriesPerSpecies: minimum })

console.log(JSON.stringify(report, null, 2))

if (strict && !report.passed) {
  process.exitCode = 1
}
