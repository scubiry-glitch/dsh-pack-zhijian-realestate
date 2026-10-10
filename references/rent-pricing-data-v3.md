# 单套住宅租金定价｜v3 字段与填报规则

`rent-pricing-data-v3.template.json` 是空白填报表，`rent-pricing-detailed-template.html` 是视觉样张。取数任务开始前先读 [取数说明与停走规则](rent-pricing-collection-runbook.md)。所有 `null` 都代表待填或待确认；不能把海兴雅苑原报告或其他报告的数字复制进来。只有独立审核通过并标记 `status=reviewed` 的文件可交给 `scripts/render-rent-pricing-detailed.py`。

## 关键表的行结构

| 字段 | 每行至少填写 | 用途与检查 |
|---|---|---|
| `productCases[]` | 案名、互斥判据、适用状态、各档价格和证据 ID | 产品形态不明时保留 A/B 案；已核实后只呈现适用案。每案独立样本池。 |
| `queryAudit[]` | `id`, `channel`, `queriedAt`, `query`, `actualFilters`, `topK`, `totalRecall`, `rawCount`, `deduplicatedCount`, `excludedCount`, `validCount`, `receiptPath`, `receiptSha256`, `truncated`, `reason` | 先核工具真正命中的过滤条件。`rawCount − duplicates − excluded = validCount`，跨查询去重另列并集。截断样本不得冒充全市场分位。 |
| `comparablePools[]` | `id`, `caseId`, `geographyLevel`, `productType`, `identity`, `listingIds`, `validN`, `min`, `p25`, `median`, `mean`, `p75`, `max`, `unitRentMedian`, `coverageStatus`, `limitations` | 同小区、商圈、区级池分别统计；挂牌与成交、整租与合租分池。若 `validN` 太小或样本截断，价格分位须降级为观察范围。 |
| `comparables[]` | `id`, `poolId`, `community`, `areaSqm`, `areaBasis`, `layout`, `rentalMode`, `floor`, `orientation`, `monthlyRent`, `identity`, `sourceDate`, `receiptId`, `included`, `reason` | 每个统计量能回到逐条房源。重复 listing ID 必须留去重记录。 |
| `reportedPools[]` | `id`, `label`, `reportedN`, `sourceId`, `rowEvidenceStatus=summary_only`, `limitations` | 仅当旧报告有汇总统计、但无法取得逐行回执时使用；摘要单列，不并入 `comparablePools[]` 或逐条样本图。 |
| `comparableEvidenceGap` | 无入选逐条可比时填写具体缺口 | 第五章会明确显示原因；缺此字段则阻止渲染，避免静默空表。 |
| `calculationSteps[]` | `id`, `caseId`, `inputIds`, `formula`, `units`, `rounding`, `result`, `nature`, `evidenceIds`, `reviewStatus` | 承重价格需要逐步复算，不能用文字总结代替算式。 |
| `trend.fallbackAttempts[]` | `level`, `name`, `geoId`, `indicatorKey`, `queriedAt`, `status`, `reason`, `receiptPath` | 顺序只能是 `community → business_circle → city`；选中层级之前的失败回执必须保留。 |
| `trend.months[]` | `month`, `value`, `sourceRow` | 按月份连续列出最近可得 12 期；缺值写 `null` 并断线，不补造。观察期和滞后必须写清。 |
| `trend.historyMonths[]` | `month`, `value`, `sourceRow` | 保存选中地理层级、同一指标的完整历史月序列；末 12 期必须与 `trend.months[]` 逐月一致。优先保存至少 24 期，供四项趋势百分比复算。 |
| `vacancyEconomics.scenarios[]` | `higherRent`, `lowerRent`, `comparisonMonths`, `holdingCost`, `breakEvenVacancyDays`, `stepId` | 让价临界天数来自同一比较期下两情景净收入相等；不能套用旧报告天数。 |
| `repricingSchedule[]` | `trigger`, `askingRent`, `action`, `economicsStepId`, `stopCondition` | 对应真实挂牌价格、看房和空置情况。业主未确认底线时，末档写“需确认”。 |
| `sources[]` | `id`, `sourceType`, `channel`, `observedAt`, `pathOrUrl`, `sha256`, `scope` | 原始回执与出稿版本可追溯。 |

## 三种“底线”必须分清

1. `modeledConcessionBoundary`：市场证据和空置情景推导出的**底价（测算硬底）**。有输入、算式和证据时可给值，并写明条件；可与 `listing.value`、`expected.value` 同画在一条月租横轴。市场测算硬底不是业主承诺。
2. `ownerConfirmedMinimum`：业主明确认可的**最低可接受月租**。未问到时保持 `null`，报告写“业主未确认”。
3. 合同或平台限价：若存在，作为独立约束列于 `subject`/`risks`，不能冒称业主偏好。

旧海兴雅苑报告把测算最后让步位称为“硬底”，但并未由业主确认。新模板会保留这一计算能力，同时更正标签。

## 趋势取数与标题

1. 先用真实同城地理搜索确认目标小区 ID，核有无同口径 12 个月序列。
2. 小区不可得，再确认所属商圈 ID 并取商圈序列；仍不可得，取同城城市级序列。
3. 每一级都核 `indicatorKey`、单位、对象级别、统计总体、月份和原始回执。不能把房价指数、租金指数与元/月租金混成一条线。
4. `selectedLevel` 只能是 `community`、`business_circle`、`city` 或 `null`。图题分别写“近 12 个月小区/商圈/城市租金趋势”。商圈或城市图作为市场背景；目标房型定价仍由同质房源决定。
5. 三层都无可用序列时，保留尝试日志和缺口卡；不得画假图。最新月滞后时写实际末月和滞后月数。
6. 选中层级后保留其**完整历史序列**，不要只截取展示用的 12 期。四项百分比由同一原始序列自动计算，均不以四舍五入后的展示均值重新计算：近 12 个月波幅 = `最高值/最低值−1`；最新月同比 = `最新月/上年同月−1`；年内变化 = `最新月/当年 1 月−1`；滚动均值同比 = `近 12 月均值/之前 12 月均值−1`。结果保留一位小数，连同分子、分母和月份展示。若历史月缺失，对应卡标“待计算”并列缺月，不能借用其他地理层级补数。

## 结论图与价差

每案把有证据的建议挂牌、目标成交中枢与区间、测算硬底放在**同一条月租横轴**。若有三档点价，列出挂牌→成交中枢、成交中枢→测算硬底、挂牌→测算硬底三段价差；三个百分比的分母统一为挂牌价。业主确认最低价单列；未确认时显示“待业主确认”，不能把市场测算硬底填入该字段。只有至少两档有可核数值时画横轴；缺少测算硬底时该标记保持缺口，不复制其他报告的数字。

## 第五章不可静默留空

复用历史报告时，先把原报告可逐行核对的查询表完整转录到 `queryAudit[]`、`comparablePools[]`、`comparables[]`，标明这是原报告转录，保留跨查询重复与去重倒推。只有汇总统计而无逐行回执的口径放 `reportedPools[]`，必须披露缺少哪些行、不能与可见表混算。原始查询回执不可得时，`receiptPath` 指向实际可核的历史报告，`channel` 和 `reason` 说明不是本次工具查询；不能把历史挂牌称为当前在租。新报告若确实无可比数据，第五章应显示查询失败原因与补数动作，并在独立评审中检查，不可用空表冒充完成取证。

历史报告转录样张设置 `report.evidenceMode=historical_transcription`，逐条图注会说明“原报告可见行转录”，不宣称当前在租。对没有原始房源 ID 的表格行使用显式转录 ID（如 `ORIG-A-01`）并在 `receiptId` 中指出原报告表和行号；跨表重复各留一行，在查询审计记录去重后的独立条目数。

## 发布门禁

- **证据门**：标的与产品形态、挂牌/成交身份、TopK 和有效 n、趋势实际层级都有可追溯回执。
- **数字门**：三档价格、分位、样本行数、面积换算、空置临界天数均能由证据和 `calculationSteps[]` 复算。缺证据的档位保持待确认。
- **表达门**：模型边界与业主底线分列；趋势层级不改名；样本截断时不报全量分位；相关性不能写成因果。
- **成品门**：审核冻结数据哈希，再从同一文件生成 HTML/PDF；核图题、表格、手机和 A4 与哈希一致。正文变更返回数字审核。

## 与现有 v2 接口的差别

v2 只有 `property.summary`、每档一个 `basis`、`sampleBoundary` 自由文本、单表 `comparables[]`、`communityTrend` 仅社区级。v3 把产品案、召回审计、分池统计、逐条可比、价格两种底线、趋势降级路径、让价表与合同清单拆成结构化字段。详细场景由 v3 渲染器自动生成正式报告；填报前须核原始回执和数值计算。
