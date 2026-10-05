# craftEvidence（schemaVersion 2）

台账不是通过回执。顶层仅含 `{schemaVersion:2,reportSha256:{md,html,pdf},body:{htmlId},chapters:[],calculations:[],policyClaims:[]}`。三 SHA 绑定最终字节；改稿后重算、重检、重审。历史台账保留原冻结版本。

`Span={markdown:"MD 精确子串",htmlId:"唯一元素 id"}`；解析后可见文字与 HTML 元素一致，仅忽略空白，保留强调/引用语法。不能用隐藏内容、代码示例或占位标记。body 为 main/article，含 MD 全文。id 字母开头，其后字母数字_-，最多96字。

每章 `{heading:"实际h2",htmlId,parts:{quote:Span,roles:Span,basis:Span,inference:Span,opportunityRisk:{opportunity:Span,risk:Span}}}`。全部分析章依序登记，六块非空互不重叠；inference 可含计算子块。

## 计算

每项唯一 id，不接受代码或容差覆盖。`Q={value:"十进制数",unit:"单位",claim:Span}` 的 span 只含一个数，数字紧连单位，如“现金储备120万元”。各输入/结果使用不同元素；`claims:[Span]` 绑定完整结论段落/表格行，其中金额、租金周期、利率和期数须来自本项输入/结果，按数值和单位计数，重复等额输入不能省略；年份、日期、脚注或行号不算计算输入。按结果显示位数舍入，不粗化精度掩盖差异。

- `{id,kind:"inverse-yield-range",baseYield:"2.0%",base:Span,scenarios:[{yield:"1.8%",change:"+11.11%",claim:Span},...]}`：共同基准块恰含一个百分数，每个独立场景块恰含收益率/涨跌两个百分数，至少两个场景。按 y₀/y−1 重算，不换基准。
- `{id,kind:"cash-balance",uses:[Q],sources:[Q],result:Q,claims:[Span]}`：结果=全部用款−全部已有来源，正数为缺口，负数为余量。uses/sources 各1至24项，输入非负，货币单位 元/万元/亿元 自动换算。购价/税费/缓冲、自有资金/新贷等逐项列明，避免漏减和重复。假设不能称核实。
- `{id,kind:"rent-multiple",rent:Q,multiple:Q,period:"月"或"年",result:Q,claims:[Span]}`：rent 单位 元/月、万元/月、亿元/月或对应 /年；multiple 单位“倍”，其 span 明写月租或年租，与 period 一致。结果=该周期租金×倍数，result 用货币单位；月租倍数不再乘12，年租倍数用年租。
- `{id,kind:"simple-interest",principal:Q,rate:Q,periods:Q,result:Q,claims:[Span]}`：结果=本金×期间百分率/100×期数。principal/result 用货币单位，rate 用 `%/月`、`%/年`、`%/日`，periods 用相同的 月/年/日；如“期间2月”“利率0.8%/月”。无本金不能报确定费用，复利/分期还款不能伪装成本公式。

- `{id,kind:"money-sum",terms:[Q],result:Q,claims:[Span]}`：结果=1至24项非负金额之和。过桥总费用可先登记 simple-interest，再用其原有 result Q（同 value/unit/claim，定位已显示的利息结果）作为求和项，加上服务费等；合计段可重述该利息金额，不必重复 DOM id。不得只列费用合计而省略本金、利率、期数。各公式放在独立段落/表格行，claims 绑定本项完整结论。

机器复算上述类型并拦截可识别段落遗漏，不证明语义全覆盖。其他关键公式仍由独立审核复算；不能以局部正确收益率块或空数组宣称全文数学正确。

## 政策

每项 `{id,status,claim:Span,asOf:"YYYY-MM-DD",jurisdiction:"地域",...}`。登记正文税率/资格/限购限贷/住房标准等定量或有效性主张，包括计算假设。

已取得官方原文：`status:"primary-text"`，另含 `source:{url:"https://官方原文",documentNumber:"文号",publishedAt:"YYYY-MM-DD",effectiveAt:"YYYY-MM-DD",excerpt:"适用条款原文",claim:Span}`。source.claim 可见地完整打印 URL、文号、发布/生效日、asOf、地域与引段；不能只有链接文字。研究时点不早于发布/生效日。Reviewer 实读原文，核对后续变更及适用条件；CLI 标题/摘要不是原文。

未核原文：`status:"conditional"`，另含 `reason:"缺少依据"`。claim 正文明确写“未核验”或“待核实”并说明结论限制；单写“假设”不够，也不得假设未经核实的规则就是现行规则，不能视为确定现行规则。无相关主张才可 `policyClaims:[]`。

政策检查通过仅证明声明结构与 MD/HTML 定位；不联网证真、不认证 URL 官方性或当前法律适用。独立审核仍判事实；必需项未知不能推荐整合。
