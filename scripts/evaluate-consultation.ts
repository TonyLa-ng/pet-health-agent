import fs from 'node:fs'
import path from 'node:path'
import { evaluateConsultationCases, type EvaluationCase } from '../src/agent/evaluation'

const casesPath = path.join(process.cwd(), 'data', 'evaluation', 'consultation-cases.json')
const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8')) as EvaluationCase[]
const report = evaluateConsultationCases(cases)

console.log(JSON.stringify(report, null, 2))

const strict = process.argv.includes('--strict')
if (strict) {
  const failed =
    report.metrics.top1Accuracy < 0.75 ||
    report.metrics.top3Recall < 0.9 ||
    report.metrics.emergencySensitivity < 0.98 ||
    report.metrics.crossSpeciesLeaks !== 0 ||
    report.metrics.lowConfidenceFormalDiagnosisRate !== 0 ||
    report.metrics.averageFollowupRounds > 3

  if (failed) {
    process.exitCode = 1
  }
}
