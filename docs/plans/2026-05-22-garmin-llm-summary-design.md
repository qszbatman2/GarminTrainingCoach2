# Garmin 数据摘要与 LLM 分析设计

## 1. 目标

基于当前已经同步到项目里的 Garmin 数据，先做一层稳定、低 token、可解释的结构化摘要，再把摘要而不是原始 JSON 交给 LLM 做分析。

本次分析聚焦两个目标：

1. 训练效率
   判断用户在“当日身体状态”允许的前提下，今天训练量是否到位，是否存在训练刺激明显不足、执行偏保守的情况。
2. 身体状态
   根据近几日和近几周的恢复、心率、睡眠、活动量和运动表现趋势，判断当前更适合多练、维持，还是多休息。

核心原则：

- 不直接把 Garmin 原始大 JSON 喂给 LLM，先做压缩摘要。
- 优先做“相对个人基线”的判断，不做通用阈值硬判。
- “偷懒”不能只看今天练得少，还要结合今天是否本来就该恢复。
- 缺失数据必须显式告诉 LLM，避免模型脑补。
- 输出要可执行，结论必须绑定证据字段。

## 2. 当前项目里已经可直接利用的数据

### 2.1 日级恢复与状态数据

当前 `DailyMetric` 已经结构化或可从 `raw` 中提取出以下字段：

- 已结构化：
  - `sleepScore`
  - `hrv`
  - `restingHr`
  - `stress`
- 已可从 `raw` 提取：
  - `trainingReadiness`
  - `bodyBatteryHigh`
  - `bodyBatteryLow`
  - `sleepDurationHours`
  - `awakeDurationMinutes`
  - `steps`
  - `activeCalories`
  - `restingCalories`
  - `intensityMinutes`
  - `moderateIntensityMinutes`
  - `vigorousIntensityMinutes`
  - `bloodOxygen`
  - `respiration`
  - `weight`
  - `enduranceScore`
  - `hillScore`
  - `runningTolerance`
  - `vo2Max`
  - `trainingStatusScore`

此外，当前还可以拿到日内序列：

- 心率分时序列
- 压力分时序列
- Body Battery 分时序列

### 2.2 活动数据

当前 `Activity` 已结构化：

- `name`
- `type`
- `distance`
- `duration`
- `date`
- `raw`

这意味着现在已经可以做：

- 今日是否训练
- 今日训练次数
- 今日训练总时长
- 今日训练总距离
- 近 7/14/28 天训练频率与总量
- 与个人近 28 天周均值对比

但当前如果想更精准判断“训练质量”或“有没有偷懒”，建议后续从 `activity.raw` 再补提以下字段：

- 平均心率 / 最大心率
- 平均配速 / 平均速度
- 训练负荷 / Training Effect
- 是否包含间歇、节奏、长距离等训练类型标签

## 3. 为什么不能直接让 LLM 看原始数据

直接喂原始 Garmin JSON 有四个问题：

1. token 成本高
2. 字段命名不稳定，同一指标可能有多种 path
3. 模型容易把“有数据”误当成“有结论”
4. 很难做稳定回归，今天和明天 prompt 结果波动会比较大

因此推荐采用两段式链路：

1. 程序层先做 deterministic summary
2. LLM 只负责解释、归因和生成建议

也就是：

`Garmin 原始数据 -> 结构化摘要 -> LLM 分析 -> 面向用户的解释`

## 4. 推荐摘要维度拆解

建议把摘要拆成 6 层，这样既能支撑“训练效率”，也能支撑“身体状态”。

### 4.1 第一层：数据范围与可信度

这层不做业务结论，只告诉 LLM 它看到的数据有多完整。

建议字段：

- `metricRange`: 日级指标起止日期
- `activityRange`: 活动记录起止日期
- `totalMetricDays`
- `totalActivities`
- `availableDays7d`
- `availableDays28d`
- `missingData`
- `confidenceHints`

作用：

- 防止 LLM 在样本只有 2-3 天时强行下结论
- 给后续“可信度”输出提供依据

### 4.2 第二层：当日身体状态摘要

这是“今天能不能练、该不该练”的核心输入。

建议字段：

- `today.date`
- `today.sleepScore`
- `today.sleepDurationHours`
- `today.hrv`
- `today.restingHr`
- `today.stress`
- `today.trainingReadiness`
- `today.bodyBatteryHigh`
- `today.bodyBatteryLow`
- `today.bloodOxygen`
- `today.respiration`

建议再补相对基线衍生值：

- `today.hrvVs7dPct`
- `today.restingHrVs7dDelta`
- `today.sleepScoreVs7dDelta`
- `today.readinessVs7dDelta`

作用：

- 让 LLM 判断今天恢复是偏强、正常还是偏弱
- 避免模型只看绝对值，不看你个人历史

### 4.3 第三层：当日训练执行摘要

这是“今天量到没到位、有没有明显划水”的核心输入。

建议字段：

- `todayLoad.activityCount`
- `todayLoad.totalDurationMin`
- `todayLoad.totalDistanceKm`
- `todayLoad.steps`
- `todayLoad.activeCalories`
- `todayLoad.intensityMinutes`
- `todayLoad.moderateIntensityMinutes`
- `todayLoad.vigorousIntensityMinutes`
- `todayLoad.sessionTypes`

建议增加相对量：

- `todayLoad.durationVs7dDailyAvgPct`
- `todayLoad.durationVs28dDailyAvgPct`
- `todayLoad.distanceVs7dDailyAvgPct`
- `todayLoad.intensityVs7dDailyAvgPct`
- `todayLoad.stepsVs7dAvgPct`

关键解释逻辑：

- 如果今天恢复状态好，但训练量远低于个人常态，才可以判断为“训练刺激不足”或“可能偷懒”
- 如果今天恢复状态差，而训练量低，则更可能是“合理恢复”

也就是说，“偷懒”必须是状态和执行一起看，不能单看量低。

### 4.4 第四层：近 7 天短周期趋势

这层用于判断身体状态是在走强还是走弱。

建议字段：

- `recovery7d.sleepScoreAvg`
- `recovery7d.hrvAvg`
- `recovery7d.restingHrAvg`
- `recovery7d.stressAvg`
- `recovery7d.trainingReadinessAvg`
- `recovery7d.bodyBatteryHighAvg`
- `recovery7d.sleepScoreTrendVsPrev7d`
- `recovery7d.hrvTrendVsPrev7d`
- `recovery7d.restingHrTrendVsPrev7d`

负荷侧建议字段：

- `load7d.activityDays`
- `load7d.activityCount`
- `load7d.totalDurationMin`
- `load7d.totalDistanceKm`
- `load7d.totalIntensityMinutes`
- `load7d.avgDurationPerActiveDay`

作用：

- 判断最近一周是否处在疲劳累积期
- 判断最近一周是否明显练少了

### 4.5 第五层：近 21-28 天中周期基线

这层是所有“是否到位”的参照系，没有这层很难判断“少练了”还是“正常训练周期”。

建议字段：

- `baseline28d.avgWeeklyDurationMin`
- `baseline28d.avgWeeklyDistanceKm`
- `baseline28d.avgWeeklyActivities`
- `baseline28d.avgDailySteps`
- `baseline28d.avgDailyIntensityMinutes`
- `baseline28d.longestSessionMin`
- `baseline28d.primaryActivityTypes`
- `baseline28d.acuteChronicRatio`

作用：

- 判断今天和最近 7 天训练量是否偏离常态
- 给 LLM 一个“个人平时训练画像”

### 4.6 第六层：关键证据与异常旗标

这层不是给用户看原始数，而是给 LLM 更容易推理的 evidence list。

建议字段：

- `flags`
  - 最近 7 天睡眠评分偏低
  - HRV 较前 7 天明显下滑
  - 静息心率较前 7 天升高
  - 训练准备度连续偏低
  - 最近 7 天训练量明显低于近 28 天周均值
  - 最近 7 天训练量高于近 28 天周均值较多
- `recentKeySessions`
  - 最近 3-5 次关键训练

作用：

- 帮助 LLM 快速抓住重点
- 减少模型自己做长链推理时的偏差

## 5. 面向这两个分析目标的最小可用摘要

如果你想先快速上线，不一定要一次做满 6 层，最小可用版本建议先做以下 4 块：

1. `todayReadiness`
2. `todayLoad`
3. `recovery7d + load7d + baseline28d`
4. `flags + missingData`

这样已经足够支撑：

- 今天该不该练
- 今天练得够不够
- 最近是在恢复变差还是负荷不足

## 6. 推荐摘要 JSON Schema

下面这版 schema 是最适合当前项目落地的结构。

```json
{
  "meta": {
    "generatedAt": "2026-05-22T10:00:00.000Z",
    "metricRange": { "start": "2026-04-20", "end": "2026-05-22" },
    "activityRange": { "start": "2026-04-20", "end": "2026-05-22" },
    "totalMetricDays": 33,
    "totalActivities": 18,
    "missingData": [],
    "confidenceHints": ["最近 28 天活动样本充足"]
  },
  "todayReadiness": {
    "date": "2026-05-22",
    "sleepScore": 78,
    "sleepDurationHours": 7.2,
    "hrv": 46,
    "restingHr": 52,
    "stress": 31,
    "trainingReadiness": 68,
    "bodyBatteryHigh": 87,
    "bodyBatteryLow": 24,
    "hrvVs7dPct": 0.09,
    "restingHrVs7dDelta": -2,
    "sleepScoreVs7dDelta": 4
  },
  "todayLoad": {
    "activityCount": 1,
    "totalDurationMin": 42,
    "totalDistanceKm": 8.1,
    "steps": 11200,
    "activeCalories": 610,
    "intensityMinutes": 38,
    "moderateIntensityMinutes": 28,
    "vigorousIntensityMinutes": 10,
    "sessionTypes": ["running"],
    "durationVs7dDailyAvgPct": -0.12,
    "durationVs28dDailyAvgPct": -0.08,
    "intensityVs7dDailyAvgPct": 0.05,
    "stepsVs7dAvgPct": 0.14
  },
  "recoveryTrend": {
    "sleepScore7dAvg": 74,
    "sleepScoreTrendVsPrev7d": "up",
    "hrv7dAvg": 42,
    "hrvTrendVsPrev7d": "up",
    "restingHr7dAvg": 54,
    "restingHrTrendVsPrev7d": "down",
    "stress7dAvg": 35,
    "trainingReadiness7dAvg": 61,
    "bodyBatteryHigh7dAvg": 79
  },
  "loadTrend": {
    "activityDays7d": 4,
    "activities7d": 5,
    "duration7dMin": 235,
    "distance7dKm": 34.7,
    "intensityMinutes7d": 168,
    "activityDays28d": 15,
    "avgWeeklyDuration28dMin": 248,
    "avgWeeklyDistance28dKm": 36.2,
    "acuteChronicRatio": 0.95
  },
  "recentKeySessions": [
    {
      "date": "2026-05-21",
      "type": "running",
      "name": "Evening Run",
      "durationMin": 42,
      "distanceKm": 8.1
    }
  ],
  "flags": [
    "恢复指标整体稳定",
    "最近 7 天训练量接近近 28 天周均值"
  ]
}
```

## 7. LLM 应该如何分析这份摘要

推荐不要让 LLM 自己发明分析框架，而是让它按两个固定问题回答：

1. 今天训练效率是否到位
2. 当前身体状态更适合多练、维持还是多休息

建议把 prompt 设计成“角色 + 规则 + 决策标准 + 固定输出 JSON”。

## 8. 推荐 System Prompt

```text
你是一名谨慎、数据驱动的耐力训练教练。

你的任务不是做医疗诊断，而是基于结构化 Garmin 摘要，判断：
1. 今天训练执行是否到位
2. 当前身体状态更适合加量、维持还是恢复

你必须遵守以下规则：
1. 只能根据输入字段做判断，严禁编造不存在的数据。
2. 优先使用“相对个人基线”判断，不要只依据通用绝对阈值。
3. “训练不足/可能偷懒”只有在身体状态允许训练、但执行量明显低于个人常态时才能成立。
4. 如果恢复状态差，低训练量更可能是合理恢复，而不是偷懒。
5. 不输出医疗诊断，不使用夸张、攻击性措辞。
6. 所有结论都要给出证据字段。
7. 如果关键字段缺失，必须降低置信度，并明确指出缺失影响。
8. 输出必须是合法 JSON，不要输出 markdown。
```

## 9. 推荐 User Prompt 模板

```text
请基于下面的 Garmin 摘要做训练分析。

分析目标：
1. 训练效率：根据当日身体状态、疲劳度、当日活动数据，判断今天训练量是否到位，是否存在训练刺激不足或执行偏保守。
2. 身体状态：根据近几日、近几周的心率、睡眠、运动量、运动表现等趋势，判断当前更适合多练、维持还是多休息。

判定优先级：
1. 先判断今天身体状态是否适合训练。
2. 再判断今天实际训练执行是否匹配身体状态。
3. 最后结合近 7 天和近 28 天趋势，给出短期建议。

输出要求：
1. 输出纯 JSON。
2. 字段固定为：
{
  "summary": "string",
  "trainingEfficiency": {
    "status": "insufficient | adequate | aggressive | recovery_day",
    "confidence": "low | medium | high",
    "reason": "string"
  },
  "bodyStatus": {
    "status": "push | maintain | recover",
    "confidence": "low | medium | high",
    "reason": "string"
  },
  "evidence": [
    {
      "metric": "string",
      "observation": "string",
      "impact": "string"
    }
  ],
  "todayRecommendation": ["string"],
  "next3DaysRecommendation": ["string"],
  "watchMetrics": ["string"],
  "missingDataImpact": ["string"]
}
3. `summary` 用 2-3 句话概括。
4. `todayRecommendation` 必须具体到强度或训练方向。
5. 如果今天本来就该休息，则 `trainingEfficiency.status` 输出 `recovery_day`，不要误判为偷懒。

输入摘要如下：
{{TRAINING_SUMMARY_JSON}}
```

## 10. 为什么推荐这个输出结构

这个输出结构比只返回一句自然语言更适合产品化：

- `trainingEfficiency.status` 直接回答“今天练得到不到位”
- `bodyStatus.status` 直接回答“接下来该多练还是多休息”
- `evidence` 便于前端展示“结论依据”
- `missingDataImpact` 便于告诉用户为什么这次分析不够稳

尤其是 `recovery_day` 这个状态很关键，它能把“今天练得少”与“今天合理恢复”区分开。

## 11. 推荐判断逻辑

建议把程序和 LLM 的职责划分清楚：

### 11.1 程序层负责

- 取最近一天、最近 7 天、前 7 天、最近 28 天数据
- 计算均值、delta、ratio、trend
- 生成 flags
- 生成 missingData
- 生成最近关键训练列表

### 11.2 LLM 负责

- 解释恢复状态和训练执行是否匹配
- 解释“低训练量”到底是合理恢复还是执行不足
- 生成自然语言建议
- 输出用户可读的结论

这样稳定性最高，也最省 token。

## 12. 推荐第一版实现顺序

### Phase A：先扩充摘要，不改 UI

先在现有 `buildTrainingContext` 基础上补以下内容：

- 增加 `todayReadiness`
- 增加 `todayLoad`
- 增加相对 7d / 28d 的 delta 和 ratio
- 增加更明确的 `flags`

### Phase B：替换 prompt

把当前偏泛化的 prompt，替换成上面的双目标 prompt。

### Phase C：前端展示拆成两张卡

建议前端最终拆成：

- `今日训练执行是否到位`
- `当前身体状态建议：多练 / 维持 / 恢复`

这样用户一眼就能看懂，不会把“恢复差”与“训练不足”混在一起。

## 13. 当前版本与理想版本的差距

当前项目已经有不错的基础，但还缺三类信息：

1. 当日维度
   现在更偏近 7 天摘要，缺真正的 `todayReadiness` 和 `todayLoad`
2. 对“是否偷懒”的判定支撑不足
   现在有负荷判断，但还没有明确把“今天状态”和“今天执行”做交叉判断
3. 活动质量特征还没吃进去
   如果后续从 `activity.raw` 再补平均心率、配速、训练效果，LLM 对“训练效率”的判断会明显更准

## 14. 建议结论

最推荐的方案不是“让 LLM 直接看 Garmin 原始数据”，而是：

1. 先做一个面向分析目标的结构化摘要
2. 摘要里同时包含：
   - 今天状态
   - 今天执行
   - 7 天趋势
   - 28 天基线
   - flags
   - missingData
3. 再让 LLM 只回答两个问题：
   - 今天训练执行是否到位
   - 当前身体状态该多练还是多休息

按这个方案做，结论会比现在更稳、更像教练判断，也更容易产品化。
