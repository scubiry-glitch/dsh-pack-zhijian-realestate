# 独立审核与证据

核对完整 reviewer 材料的 pack id/digest、task/attempt/session，接收同次三件套固定字节与可信机器检查。路径、旧“已读”、作者脚本 PASS 不替代 Host 收据；缺必需材料记录未验证。

逐章审五件套实质，核对事实来源、范围和不确定性。先盘点影响结论的全部计算，再对照 ledger，独立复算遗漏、未支持或未识别公式；尤其全部资金来源、月/年租倍数、本金/利率/期间及利息加服务费等合计；计息结论与费用加总分开复算。上游获审不免除下游复算。

政策实际核读官方 URL 原文，对照文号、地域、发布/生效日、研究时点与后续变更；标题摘要不是原文。只有惯例/摘要的税率须评为未核条件，不能认定现行事实。政策机器 PASS 仅指结构及定位。

对照当前 MD、HTML/PDF，观察1280/375截图及必要PDF页面。引用 SHA、页/章/DOM id/计算 id 与自己的判断，不复制作者结论。机器范围不覆盖全部事实、语义或审美。

先用 `expert_teams_quality_review prepare_only:true` 取得 material_receipt、完整材料和预检；准备不是审核。正常提交 `independent_review:[{id,status,coverage,evidence:[{artifactId:"published:report.md",quote:"实际MD原文",reason:"审阅依据"}]}]`。内容技能要求 chapter-substance、facts-and-uncertainty、calculations-and-coverage；渲染再要求 visual-and-format。每域（含视觉）必须以当前 MD 引文为主锚点，HTML DOM/PDF页/截图/机器结果写 reason/coverage；不能用 HTML+摘要替代 MD。每项 acceptance_result 写 detail，身份/task/attempt 使用工具正式绑定，不代理别人。

各必需项独立给 passed/failed/unverified 与实际覆盖限制；硬失败或必需未知不得推荐整合。finding 可操作，走有限修订，不改已发布版本造通过。审核只绑定本组字节；改稿后重新覆盖全部适用项，不沿用旧审查，也不强制复制历史样式。
