# 渲染执行

固定 MD 为单源；改观点回 MD，再重建三格式和证据。HTML 内联包内 base/palette CSS、组件和唯一定位 id；受控本地字体，无脚本/外链资源，不用伪元素承载业务正文。

AA 按实际合成样式检查：普通字≥4.5:1，大字≥3:1；大字为24px或18.67px加粗，不舍入。离线1280/375检布局、锚点与本版截图，不能用裁切掩盖溢出。PDF 无页码封面封底，正文品牌与1/N至N/N、匹配章节大纲；拼接后解析最终PDF、必要渲染并核对SHA。

可选包内单源生成；AI 选择 credit-policy 或 designer-paper：

```sh
python3 -I "<packRoot>/scripts/build-report.py" --md /abs/report.md --out-dir /abs/new-revision --variant credit-policy
```

新目录输出原样 MD、HTML/PDF、build.json、anchors-index.json 和 anchors.json。AI按短索引选择六个不重叠内容块及计算/政策声明，用 `{"$anchor":"id"}` 引用。由脚本复制精确正文和SHA，勿手抄Span；结构选错仍会失败。绑定格式见包内 references/evidence-binding.md。

```sh
python3 -I "<packRoot>/scripts/assemble-evidence.py" --build-dir /abs/new-revision --bindings /abs/bindings.json --out /abs/new-evidence.json
```

支持 Markdown 标题/引用/表格/列表/强调；原始 HTML、图片及资源加载不支持，可自选其他渲染流程。依赖 markdown_it、beautifulsoup4、weasyprint、pypdf、PyMuPDF、中文字体，不自动安装。退出0仅生成草稿，2未生成。

当前 AI 选择 `[{packId,skillId,variant?,reason}]` 写入 selections.json，发布前运行：

```sh
node "<packRoot>/scripts/preflight-report.mjs" --md /abs/report.md --html /abs/report.html --pdf /abs/report.pdf --ledger /abs/craft-evidence.json --selections /abs/selections.json
```

packRoot 为 Host 记录的包绝对根。只用本包 checker/已装依赖；退出0机器检查通过、1失败、2未验证或输入错误。按 finding 修复后重跑，沿用 attempt/剩余预算。缺依赖不能自造简化检查器；生成/预检都不签 Host 收据、不替代独立审核。
