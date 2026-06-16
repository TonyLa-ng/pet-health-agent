# Pet Health Agent 三轮审计报告

生成时间：2026-06-15T06:07:45.255Z
样本规模：600 条问询（犬 100 种疾病 + 猫 100 种疾病，三轮变体）

## 总览

- 输出类型：{"followup":210,"report_kb":168,"blocked_or_error":206,"report_llm_fallback":16}
- 急症分级：{"watch":70,"normal":317,"urgent":7,"missing":206}
- 平均耗时：14 ms；P95：51 ms
- 问题计数：{"BLOCKED_OR_ERROR_RESPONSE":206,"SAFETY_QUERY_BLOCKED_INSTEAD_OF_GUIDANCE":204,"EXPECTED_EMERGENCY_NOT_CRITICAL":119,"LLM_FALLBACK":16,"IRRELEVANT_FOLLOWUP_FOR_URINARY_CASE":5}

## 问题样例（前 25 条）

| 轮次 | 物种 | 疾病 | 输出 | 分诊 | 问题 | 首个追问/KB命中 |
|---:|---|---|---|---|---|---|
| 1 | 犬 | 犬细小病毒肠炎 | followup | watch/52 | EXPECTED_EMERGENCY_NOT_CRITICAL | 宠物是否有翻垃圾桶或啃咬玩具的习惯？ |
| 1 | 犬 | 犬胃扩张扭转(GDV) | report_kb | normal/24 | EXPECTED_EMERGENCY_NOT_CRITICAL | 犬蛔虫病 |
| 1 | 犬 | 犬肝损伤 | blocked_or_error | missing/0 | BLOCKED_OR_ERROR_RESPONSE, SAFETY_QUERY_BLOCKED_INSTEAD_OF_GUIDANCE, EXPECTED_EMERGENCY_NOT_CRITICAL |  |
| 1 | 犬 | 犬肺炎 | report_kb | normal/38 | EXPECTED_EMERGENCY_NOT_CRITICAL | 吸入性肺炎 |
| 1 | 犬 | 犬鼻炎 | report_llm_fallback | normal/28 | LLM_FALLBACK |  |
| 1 | 犬 | 犬短头综合征 | report_kb | normal/24 | EXPECTED_EMERGENCY_NOT_CRITICAL | 短头综合征 |
| 1 | 犬 | 犬气胸 | report_kb | watch/49 | EXPECTED_EMERGENCY_NOT_CRITICAL | 肺水肿 |
| 1 | 犬 | 犬胸腔积液 | report_kb | normal/36 | EXPECTED_EMERGENCY_NOT_CRITICAL | 肺水肿 |
| 1 | 犬 | 犬椎间盘疾病(IVDD) | followup | normal/4 | EXPECTED_EMERGENCY_NOT_CRITICAL | 犬有无吃洋葱/大蒜或含这些成分的人类食物？ |
| 1 | 犬 | 犬膀胱结石 | report_kb | watch/44 | EXPECTED_EMERGENCY_NOT_CRITICAL | 膀胱结石 |
| 1 | 犬 | 犬肾衰竭(急性) | report_kb | normal/4 | EXPECTED_EMERGENCY_NOT_CRITICAL | 急性胃炎 |
| 1 | 犬 | 犬充血性心力衰竭 | report_kb | normal/24 | EXPECTED_EMERGENCY_NOT_CRITICAL | 肺水肿 |
| 1 | 犬 | 犬心肌病 | report_kb | normal/24 | EXPECTED_EMERGENCY_NOT_CRITICAL | 免疫介导性溶血性贫血(IMHA) |
| 1 | 犬 | 犬癫痫 | followup | normal/38 | EXPECTED_EMERGENCY_NOT_CRITICAL | 咳嗽是否在运动后立即出现？ |
| 1 | 犬 | 犬脑炎 | followup | normal/20 | EXPECTED_EMERGENCY_NOT_CRITICAL | 有无麻醉/呕吐/癫痫发作后发生？ |
| 1 | 犬 | 犬脊髓炎 | followup | normal/4 | EXPECTED_EMERGENCY_NOT_CRITICAL | 犬有无吃洋葱/大蒜或含这些成分的人类食物？ |
| 1 | 犬 | 犬瘟热 | report_kb | normal/20 | EXPECTED_EMERGENCY_NOT_CRITICAL | 犬窝咳（传染性气管支气管炎） |
| 1 | 犬 | 犬细小病毒病 | followup | normal/36 | EXPECTED_EMERGENCY_NOT_CRITICAL | 犬是否完成疫苗接种？ |
| 1 | 犬 | 犬狂犬病 | report_llm_fallback | normal/4 | LLM_FALLBACK |  |
| 1 | 犬 | 犬青光眼 | report_llm_fallback | normal/4 | LLM_FALLBACK |  |
| 1 | 犬 | 犬干眼症 | report_llm_fallback | normal/32 | LLM_FALLBACK |  |
| 1 | 犬 | 犬结膜炎 | report_llm_fallback | normal/4 | LLM_FALLBACK |  |
| 1 | 犬 | 犬角膜炎 | report_llm_fallback | normal/4 | LLM_FALLBACK |  |
| 1 | 犬 | 犬眼睑内翻 | report_llm_fallback | watch/40 | LLM_FALLBACK |  |
| 1 | 犬 | 犬甲状旁腺功能减退 | followup | normal/20 | EXPECTED_EMERGENCY_NOT_CRITICAL | 血糖最低降到多少？ |

## 原始结果

完整 JSON 见 `audit/three-round-agent-audit-results.json`。