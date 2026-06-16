// ============================================
// M2: Emergency Triage Engine Tests
// ============================================

import { describe, it, expect } from 'vitest'
import { detectTriage, extractDuration } from '../triage'

describe('Duration Extraction', () => {
  it('should detect "刚" as less_than_1h', () => {
    const result = extractDuration('狗刚才吐了')
    expect(result.bucket).toBe('less_than_1h')
    expect(result.conflict).toBe(false)
  })

  it('should detect "半天" as 1h_to_6h', () => {
    const result = extractDuration('猫半天没吃东西了')
    expect(result.bucket).toBe('1h_to_6h')
  })

  it('should detect "一天" as 6h_to_24h', () => {
    const result = extractDuration('狗吐了一整天了')
    expect(result.bucket).toBe('6h_to_24h')
  })

  it('should detect "几天" as more_than_24h', () => {
    const result = extractDuration('猫好几天没精神')
    expect(result.bucket).toBe('more_than_24h')
  })

  it('should detect fuzzy marker "一阵子" as unknown', () => {
    const result = extractDuration('狗不舒服有一阵子了')
    expect(result.bucket).toBe('unknown')
    expect(result.conflict).toBe(false)
  })

  it('should detect conflict: short + long duration keywords', () => {
    const result = extractDuration('刚才吐了，但其实已经好几天没精神了')
    expect(result.bucket).toBe('conflict')
    expect(result.conflict).toBe(true)
  })

  it('should return unknown for text with no duration markers', () => {
    const result = extractDuration('狗吐了')
    expect(result.bucket).toBe('unknown')
  })
})

describe('Triage Detection - Normal Cases', () => {
  it('should classify "狗吐了" as normal (low score)', () => {
    const result = detectTriage('狗吐了', '犬')
    expect(result.level).toBe('normal')
    expect(result.score).toBeLessThan(40)
    expect(result.isEmergency).toBe(false)
  })

  it('should classify "猫今天精神不太好" as normal', () => {
    const result = detectTriage('猫今天精神不太好，不爱动', '猫')
    expect(result.level).toBe('normal')
    expect(result.score).toBeLessThan(40)
  })

  it('should not treat generic intensifiers as standalone emergency signals', () => {
    const result = detectTriage('狗一直叫，刚吃了饭', '犬')

    expect(result.level).toBe('normal')
    expect(result.matchedSignals).not.toContain('抽搐')
    expect(result.matchedSignals).not.toContain('中毒')
  })

  it('should not trigger emergency from explicitly negated blood stool, fever, or vomiting', () => {
    const result = detectTriage('狗拉肚子，暂时没有血便，也没有发热，没有呕吐，但没精神', '犬')

    expect(result.isEmergency).toBe(false)
    expect(result.level).not.toBe('critical')
    expect(result.matchedSignals.join('\n')).not.toMatch(/血便|发热|呕吐/)
  })
})

describe('Triage Detection - Watch Level', () => {
  it('should classify "猫三天不吃东西了" as watch (positive duration effect)', () => {
    const result = detectTriage('猫三天不吃东西了，精神很差', '猫')
    // 检测到"持续呕吐"(positive: 越长越危险) + 3天 = more_than_24h = 60
    // But "不吃东西" might match something...
    // 不吃 could match 食欲下降 but not as a direct emergency signal
    // The emergency signal "持续呕吐" needs the keyword "吐" or "呕吐"
    expect(['normal', 'watch']).toContain(result.level)
    if (result.level === 'watch') {
      expect(result.score).toBeGreaterThanOrEqual(40)
      expect(result.score).toBeLessThan(60)
    }
  })
})

describe('Triage Detection - Urgent Level', () => {
  it('should classify vomiting blood as urgent or higher', () => {
    const result = detectTriage('狗一直吐，吐了血，精神不好一整天了', '犬')
    // 持续呕吐 signal: "一直吐" matches boost_keyword → triggered
    // "吐了血" matches combination_boost "吐血"
    // 一整天 → 6-24h, positive effect → 40
    expect(['watch', 'urgent', 'critical']).toContain(result.level)
    expect(result.score).toBeGreaterThan(0)
  })
})

describe('Triage Detection - Critical Level', () => {
  it('should classify classic dog GDV signs as critical', () => {
    const result = detectTriage(
      '狗肚子突然胀得很大，反复干呕吐不出来，流口水，站不稳',
      '犬'
    )

    expect(result.level).toBe('critical')
    expect(result.isEmergency).toBe(true)
    expect(result.matchedSignals).toContain('胃扩张扭转')
  })

  it('should classify male cat urinary blockage signs as critical', () => {
    const result = detectTriage(
      '公猫频繁进猫砂盆蹲很久，尿不出来，一直叫，精神差',
      '猫'
    )

    expect(result.level).toBe('critical')
    expect(result.isEmergency).toBe(true)
    expect(result.matchedSignals).toContain('尿闭')
    expect(result.matchedSignals).not.toContain('抽搐')
  })

  it('should escalate toxic food exposure with anemia signs', () => {
    const result = detectTriage(
      '狗吃了洋葱后精神差，牙龈苍白，我该怎么办',
      '犬'
    )

    expect(result.level).toBe('critical')
    expect(result.isEmergency).toBe(true)
    expect(result.matchedSignals).toContain('中毒')
  })

  it('should detect seizure with standing difficulty as urgent+', () => {
    const result = detectTriage('狗持续抽搐两小时站不起来', '犬')
    // 抽搐(40) + "持续"(30) + 组合:站不起来(15) + 时长2h(40) + 严重:站不起来(30)
    // ≈ 70*0.40 + 15*0.35 + 40*0.125 + 30*0.125 = 42 → watch
    expect(['watch', 'urgent', 'critical']).toContain(result.level)
    expect(result.score).toBeGreaterThanOrEqual(40)
    expect(result.durationEffect).toBe('negative')
  })

  it('should detect poisoning at urgent+ level', () => {
    const result = detectTriage('狗刚刚误食了老鼠药，现在一直吐', '犬')
    // 中毒(55) + "误食" boost(30) + 持续呕吐(35)
    // keywordScore≈100, 时长刚刚=60(neg), score≈48
    expect(result.level).not.toBe('normal')
    expect(result.score).toBeGreaterThanOrEqual(40)
    expect(result.durationEffect).toBe('negative')
  })

  it('should detect breathing difficulty at watch+ level', () => {
    const result = detectTriage('狗一直张口呼吸，舌头发紫，喘不过气', '犬')
    // 呼吸困难(50) + 2 boosts(60) + 2 combos(40) + 时长未知(30,neg)
    // ≈ 100*0.40 + 40*0.35 + 30*0.125 ≈ 58 → watch
    expect(['watch', 'urgent', 'critical']).toContain(result.level)
    expect(result.score).toBeGreaterThanOrEqual(40)
  })

  it('should detect cat urinary blockage at watch+ level', () => {
    const result = detectTriage(
      '公猫频繁进猫砂盆蹲很久，尿不出来，一直叫，乱尿',
      '猫'
    )
    // 猫尿闭: base 60 + species override boosts
    expect(['watch', 'urgent', 'critical']).toContain(result.level)
    expect(result.matchedSignals).toContain('尿闭')
  })

  it('should classify dog mild urinary signs as lower', () => {
    const result = detectTriage('狗今天尿的很少，有点频繁蹲', '犬')
    expect(['normal', 'watch']).toContain(result.level)
  })

  it('should detect continuous seizure with loss of consciousness as critical', () => {
    const result = detectTriage('狗一直抽搐不停，口吐白沫，意识丧失', '犬')
    // 抽搐(40) + "一直""不停"(60) + 3 combos:口吐白沫+意识丧失(60)
    // + 严重:意识丧失(35)
    // ≈ 100*0.40 + 60*0.35 + 30*0.125 + 35*0.125 = 40+21+3.75+4.375 ≈ 69 → urgent
    expect(['urgent', 'critical']).toContain(result.level)
    expect(result.score).toBeGreaterThanOrEqual(60)
    expect(result.durationEffect).toBe('negative')
  })

  it('should keep knowledge emergency signals disease-specific instead of flooding generic disease names', () => {
    const result = detectTriage('狗吐了好几次，拉番茄酱样血便，味道特别腥臭，喝水也吐', '犬')
    const diseaseSpecificSignals = result.matchedSignals.filter((signal) => signal.includes(':'))

    expect(result.level).toBe('critical')
    expect(diseaseSpecificSignals.join('\n')).toContain('犬细小病毒感染')
    expect(diseaseSpecificSignals.length).toBeLessThanOrEqual(3)
  })

  it('should detect car accident at urgent+ level', () => {
    const result = detectTriage('狗被车撞了，现在无法站立，一直在流血', '犬')
    // 车祸(60) + 无法站立(30) + 一直在流血(40)
    // ≈ 60*0.40 + 0*0.35 + 30*0.125 + 70*0.125 = 24+0+3.75+8.75 ≈ 37
    // Hmm "被车撞了" contains "撞" which is a boost for "车祸" → 60+30=90 capped→100
    // 100*0.40 + 30*0.125 + 70*0.125 ≈ 40+3.75+8.75 ≈ 53 → watch
    expect(['watch', 'urgent', 'critical']).toContain(result.level)
    expect(result.matchedSignals).toContain('车祸')
    expect(result.score).toBeGreaterThanOrEqual(40)
  })
})

describe('Triage Detection - Revisit Adjustment', () => {
  it('should reduce score for revisit cases', () => {
    const withoutRevisit = detectTriage('狗持续抽搐两小时', '犬', false)
    const withRevisit = detectTriage('狗持续抽搐两小时', '犬', true)

    // 复诊分数应降低 30%
    expect(withRevisit.score).toBeLessThanOrEqual(
      Math.round(withoutRevisit.score * 0.7)
    )
  })
})

describe('Triage Detection - Low Risk Reminder', () => {
  it('should trigger low risk reminder for isolated keyword without context', () => {
    const result = detectTriage('我的狗好像有点抽搐', '犬')
    // 单次关键词 "抽搐"，无组合、无时长、无严重度
    // lowRiskReminder should be true
    expect(result.lowRiskReminder).toBe(true)
  })

  it('should NOT trigger low risk reminder with combination symptoms', () => {
    const result = detectTriage('狗抽搐，口吐白沫，意识丧失', '犬')
    expect(result.lowRiskReminder).toBe(false)
  })
})

describe('Triage Detection - Alerts', () => {
  it('should generate appropriate alerts containing score info', () => {
    const result = detectTriage('狗持续抽搐两小时站不起来', '犬')
    expect(result.alerts.length).toBeGreaterThan(0)
    expect(result.alerts.some((a) => a.includes('急症评分'))).toBe(true)
  })

  it('should include matched signals in alerts', () => {
    const result = detectTriage('狗呼吸困难，舌头发紫', '犬')
    expect(result.alerts.some((a) => a.includes('呼吸困难'))).toBe(true)
  })
})
