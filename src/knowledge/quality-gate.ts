import { loadAllKnowledge } from './loader'
import type { KnowledgeEntry } from './types'

export interface KnowledgeQualityOptions {
  minimumActiveEntriesPerSpecies?: number
}

export interface KnowledgeEntryQualityIssue {
  entryId: string
  disease: string
  issues: string[]
}

export interface SpeciesKnowledgeQuality {
  species: '犬' | '猫'
  activeCount: number
  missingToMinimum: number
  entryIssues: KnowledgeEntryQualityIssue[]
}

export interface KnowledgeQualityReport {
  passed: boolean
  minimumActiveEntriesPerSpecies: number
  species: Record<'犬' | '猫', SpeciesKnowledgeQuality>
}

export function evaluateKnowledgeQuality(
  options: KnowledgeQualityOptions = {}
): KnowledgeQualityReport {
  const minimum = options.minimumActiveEntriesPerSpecies ?? 100
  const dog = evaluateSpecies('犬', minimum)
  const cat = evaluateSpecies('猫', minimum)

  return {
    passed:
      dog.missingToMinimum === 0 &&
      cat.missingToMinimum === 0 &&
      dog.entryIssues.length === 0 &&
      cat.entryIssues.length === 0,
    minimumActiveEntriesPerSpecies: minimum,
    species: {
      犬: dog,
      猫: cat,
    },
  }
}

function evaluateSpecies(species: '犬' | '猫', minimum: number): SpeciesKnowledgeQuality {
  const entries = loadAllKnowledge(species).filter((entry) => entry.status === 'active')
  return {
    species,
    activeCount: entries.length,
    missingToMinimum: Math.max(0, minimum - entries.length),
    entryIssues: entries
      .map(evaluateEntry)
      .filter((issue): issue is KnowledgeEntryQualityIssue => issue !== null),
  }
}

function evaluateEntry(entry: KnowledgeEntry): KnowledgeEntryQualityIssue | null {
  const issues: string[] = []
  const coreSymptoms = entry.key_symptoms?.filter((symptom) => symptom.weight === 'core') || []

  if (coreSymptoms.length < 2) issues.push('核心症状少于2个')
  if ((entry.rule_out || []).length < 2) issues.push('rule_out少于2条')
  if ((entry.required_tests || []).length < 1) issues.push('required_tests为空')
  if ((entry.severity_stages || []).length < 1) issues.push('severity_stages为空')
  if ((entry.references || []).length < 1) issues.push('references为空')
  if ((entry.report_profile?.forbidden || []).length < 1) issues.push('report_profile.forbidden为空')

  if (issues.length === 0) return null
  return {
    entryId: entry.id,
    disease: entry.disease,
    issues,
  }
}
