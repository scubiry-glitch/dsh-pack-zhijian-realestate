# 租金定价数据模板 v2

本文件是新场景的正文与页面接口。作者填写一次 JSON；渲染脚本从同一文件生成 Markdown、HTML、PDF 和哈希账本。参考海兴雅苑的是信息顺序与图形关系，不能复用其价格、样本或趋势。

## 任务图

1. 取证：核标的条件，保存真实原始回执和可比样本。一个共同证据包同时供测算和复核使用；工具不可用时留下缺口，不重复派三路去碰同一故障。
2. 定价：填写本模板数据，计算挂牌建议、目标成交推断、业主底线。每个数字标性质、条件、来源。Host 的独立评审复算承重数字；有阻断项在这个任务的下一 attempt 修改。
3. 渲染：由脚本从同一 JSON 生成 MD/HTML/PDF 和账本；核对手机与 A4。脚本、模板和轻量机器检查承担版式工作。

## JSON 字段

| 字段 | 类型 | 规则 |
|---|---|---|
| title, asOfDate, summary | 字符串 | 一条清晰的标的标题、YYYY-MM-DD 基准日、结论句 |
| property.summary | 字符串 | 地点、户型、面积及出租方式；未知写“待核” |
| property.conditions, property.unknowns | 字符串数组 | 已知的适用条件与改变报价的未知项分开 |
| tiers.listing / expected / floor | 对象 | 每档含 label、nature、basis；金额为 value 或 range；无证据写 null 且 nature=待确认 |
| tiers.*.source | 字符串 | 有数值时必填证据入口或明确的计算回执 |
| comparables | 对象数组 | 每行 label、price、identity（挂牌/成交）、date、source，area 可为空；仅输入真实可比样本 |
| sampleBoundary | 字符串 | 地域、产品、TopK、有效 n、去重和召回边界；不称市场全量 |
| methods.comparable / unitArea / substitute | 三个必填对象 | 固定为同质可比主估计、单位面积交叉验证、替代品边界校验；每项有 status、finding、calculation、evidence |
| calculationSteps | 对象数组 | 有任何三档数值时必填至少一步；逐步列出 step、inputs、formula、result、evidence，供复算，不以方法摘要代替 |
| communityTrend | 对象 | status 为 available/unavailable；scope 明确社区统计口径，source 写来源或缺口；available 时 months 为连续 12 个 YYYY-MM 与月租 value（缺失可为 null），末月为基准日当月或上月，至少两个观测点；unavailable 时 months 为空 |
| cases | 可选对象数组 | 仅有互斥产品形态时填 title、condition、decision |
| actions, limitations, sources | 字符串数组 | 挂牌和复核动作、适用限制、可追溯来源 |

金额字段单位统一为元/月。value 为单个数值，range 为两个从低到高的数值，两者不可并填；均为空时显示“待确认”。nature 只能为观测、计算、推断、建议或待确认。没有真实成交价时目标成交只能标推断；没有业主成本和偏好时底线保持待确认。空置阈值需要说明合同期、持有成本、两种情景价格和算式。

三种参考依据是固定栏位，不得用一个自由文本列表代替：① 同质可比法优先核同小区同产品，不足再扩至板块或区级并记录异质性；② 单位面积租金法写出单价、面积和换算，同一可比池仅构成算术交叉，不能冒充独立证据；③ 替代品锚定法只检验边界，不能直接报目标房点估计。每项 status 只能为“已核验”“证据不足”“不适用”。缺数据时必须说明未计算原因和取数缺口，不能填旧报告数字。

页面固定为“适用条件 → 三档决策 → 条件分案（按需）→ 样本分布与可比明细表 → 三种定价参考依据 → 计算逻辑明细 → 近 12 个月社区租金趋势 → 行动 → 风险与来源”。样本图直接由 comparables 生成；若无样本，页面显示缺口，不画假图。计算明细需让读者从输入、算式重得结果，并把主估计、交叉验证和最终建议的连接说清。社区趋势必须使用该小区真实连续 12 个月序列；缺月显示缺失并断线，数据不可得则展示缺口。社区混合趋势只能说明背景，不能替代目标户型租金或被用作独立定价样本。旧报告的月份、价格和图形均不可复用。

## 渲染

可从 [空数据样例](rent-pricing-data-v2.example.json)复制字段结构。从本包根目录运行 python3 scripts/render-rent-pricing.py --data /abs/path/t2-pricing-data.json --md /abs/path/report.md --html /abs/path/report.html --pdf /abs/path/report.pdf --ledger /abs/path/craft-evidence.json。

脚本只检查字段与生成物一致性，不证明定价正确。独立复核者仍须复算价格、样本和来源。输出账本的 dataSha256、mdSha256、htmlSha256、pdfSha256 用于锁定同一版本。PDF 应由这份 HTML 直接生成，并检查可选文字和实际布局；正文事实变化时重新审核数据文件。
