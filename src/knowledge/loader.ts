// ============================================
// Knowledge Loader — M1 知识库 JSON 加载器
// 使用 fs 读取（服务端专用，API Routes 中调用）
// ============================================

import fs from 'fs'
import path from 'path'
import type { KnowledgeEntry, EmergencyRules, DurationDict, SpeciesConfig } from './types'
import { enrichKnowledgeEntries } from './enrichment'

/** 数据目录根路径 */
const DATA_DIR = path.resolve(process.cwd(), 'data')

/** 同义词映射表类型 */
export interface SynonymTable {
  version: number
  species: string
  mappings: Record<string, string[]>
}

/** 物种名 → 文件名映射 */
const SPECIES_FILE_MAP: Record<string, string> = {
  '犬': 'dogs',
  '猫': 'cats',
  '兔': 'rabbits',
  '仓鼠': 'hamsters',
}

/**
 * 读取 JSON 文件
 */
function readJSON<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf-8')
  return JSON.parse(raw) as T
}

/**
 * 加载指定物种和类别的知识条目
 */
export function loadKnowledge(
  species: '犬' | '猫' | '兔' | '仓鼠',
  category: string
): KnowledgeEntry[] {
  const dirName = SPECIES_FILE_MAP[species] || species
  const filePath = path.join(DATA_DIR, 'knowledge', 'species', dirName, `${category}.json`)

  if (!fs.existsSync(filePath)) {
    return []
  }

  const entries = readJSON<KnowledgeEntry[]>(filePath)
  return enrichKnowledgeEntries(entries.filter((e) => e.status === 'active'))
}

/**
 * 加载指定物种的所有知识条目
 */
export function loadAllKnowledge(species: '犬' | '猫' | '兔' | '仓鼠'): KnowledgeEntry[] {
  const dirName = SPECIES_FILE_MAP[species] || species
  const speciesDir = path.join(DATA_DIR, 'knowledge', 'species', dirName)

  if (!fs.existsSync(speciesDir)) {
    return []
  }

  const entries: KnowledgeEntry[] = []
  const files = fs.readdirSync(speciesDir).filter((f) => f.endsWith('.json'))

  for (const file of files) {
    const filePath = path.join(speciesDir, file)
    const data = readJSON<KnowledgeEntry[]>(filePath)
    entries.push(...data.filter((e) => e.status === 'active'))
  }

  return enrichKnowledgeEntries(entries)
}

/**
 * 加载急症规则
 */
export function loadEmergencyRules(): EmergencyRules {
  const filePath = path.join(DATA_DIR, 'knowledge', 'emergency_rules.json')
  return readJSON<EmergencyRules>(filePath)
}

/**
 * 加载时长提取词典
 */
export function loadDurationDict(): DurationDict {
  const filePath = path.join(DATA_DIR, 'knowledge', 'duration_dict.json')
  return readJSON<DurationDict>(filePath)
}

/**
 * 加载同义词表
 */
export function loadSynonyms(species: '犬' | '猫' | '兔' | '仓鼠'): SynonymTable {
  const dirName = SPECIES_FILE_MAP[species] || species
  const filePath = path.join(DATA_DIR, 'synonyms', `${dirName}.json`)

  if (!fs.existsSync(filePath)) {
    return { version: 1, species, mappings: {} }
  }

  return readJSON<SynonymTable>(filePath)
}

/**
 * 加载物种配置
 * 对于未配置的物种，返回默认配置（允许检索但不允许诊断）
 */
export function loadSpeciesConfig(species: '犬' | '猫' | '兔' | '仓鼠'): SpeciesConfig {
  const dirName = SPECIES_FILE_MAP[species] || species
  const filePath = path.join(DATA_DIR, 'species_config', `${dirName}.json`)

  if (!fs.existsSync(filePath)) {
    // 返回兜底默认配置
    return {
      species,
      normal_vitals: {
        temperature: { min: 36, max: 42, unit: '℃' },
        heart_rate: { min: 60, max: 300, unit: 'bpm' },
        respiratory_rate: { min: 10, max: 80, unit: 'bpm' },
      },
      emergency_override: [],
      extra_mandatory_fields: [],
      allow_cross_species_search: false,
      allow_disease_diagnosis: false,
      enabled_features: ['symptom_check', 'emergency_detect', 'general_advice'],
      disabled_features: ['disease_diagnosis'],
      excluded_diseases: [],
    }
  }

  return readJSON<SpeciesConfig>(filePath)
}
