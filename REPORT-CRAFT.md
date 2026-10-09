# 智见房地产领域包：报告工艺

`zhijian-realestate` 领域包闭环提供报告工艺、两份原始参考、共享组件、检查代码与审核规则。安装和导出以整个领域包为单位，不依赖全局 `knowledge/skills` 或插件 `lib` 中的智见实现。

AI 从已启用包的技能目录选择：

- `zhijian-report-craft`：内容结构、来源与计算；可以单独用于报告内容工艺。
- `zhijian-designer-render`：HTML/PDF 渲染；显式组合内容技能，并在 `credit-policy` / `designer-paper` 中选择样式。
- `zhijian-rent-pricing`：具体出租标的的产品核验、同质可比、交叉测算、调价建议与报告页面；须组合 `zhijian-report-craft`，不与通用渲染/V5 工艺叠选。新场景 `zhijian-rent-pricing` 配套任务图、输出模板和可填写页面骨架。

`skill-packages` 记录技能身份与本地摘要；`craft` 记录适用说明、依赖、必需材料和检查；`references` 保存唯一共享参考与组件；`checks/source` 为本包检查器权威源码，`checks/*.mjs` 为确定性构建产物。旧版插件中的 v1/v2 实现只用于历史兼容。

安装后的 Host 负责验证声明、冻结选择、完整交付所选材料、执行受控检查和绑定证据。执行代码来自已安装且摘要验证通过的包；此协议不声称为任意不可信脚本提供操作系统沙箱。

运行依赖由环境提供：Node.js、Python 3、Markdown/HTML/PDF 解析库、Playwright 和离线 Chromium。检查过程不自动下载或安装依赖；缺失返回未验证。包内命令 `node scripts/preflight-report.mjs --help` 给出本地诊断用法。

机器检查仅覆盖声明范围；内容和审美仍需独立审核。参考报告的历史业务内容不是新任务数据。

1.3.0 的台账 schema 2 增加资金平衡、租金周期倍数、单利费用及政策证据结构检查。原始参考字节保留；旧任务仍按其冻结版本解释。构建完整包用 `npm run build:pack` / `npm run check:pack`；旧基础生成 CLI 不得覆盖带 craft 的包。

1.3.1 增加可选的包内 MD 单源生成工具，提供同源三格式、章节/数量定位、PDF 大纲和正文页脚；不生成审核结论，既有检查与证据要求保持。
