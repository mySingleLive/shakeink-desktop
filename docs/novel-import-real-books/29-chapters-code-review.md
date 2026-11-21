# 精确英文章界 helper 独立代码审核

日期：2026-10-26（Asia/Shanghai）。审核者：独立子代理 `unified_picker_review`。

**结论：本轮独立章界 helper 代码审核通过，未发现必须修订项。** 仅批准两文件的当前实现，未接共享生产入口；不把纯函数/合成切章结果当作应用导入、M02自动章界、整书语义或发布通过。

## 范围与身份

按已通过21/24，仅审以下新增文件，无生产代码改动：

| 文件 | SHA-256 |
| --- | --- |
| `desktop/core/novel-import-chapters.ts` | `5862a0461669732d2568c71ca8f867c0f87a20cc8b81c48a15135ca4b9e17eec` |
| `tests/unit/novel-import-chapters.test.ts` | `3ae06c71f22bb78cf27b61a287842f5e3c4ca44d4bf8aece6cfcf8e2cc08dbfc` |

只读参考当前core既有 `importChapters` 的manual cuts路径及21相关要求。没有修改core/main/shared/publish，不运行额外NI、应用/CUA/UI、模型或数据库，不读取Key/真实journal。L02离线检查只读取主代理明确列出的生产正文与冻结source-map，不读其他原件/作品。

## 代码判断

- `detectImportChapterCuts` 仅返回cuts/诊断；logicalLines从原字符串记录UTF-16半开边界，CRLF/CR/LF在扫描时识别，原text不trim、不归一化换行。装饰/边缘空白仅处理显示标题副本，切片仍包含完整原标题、正文和跨章空白。
- 英文数值解析支持数字及通用英语基数词，组合十位、hundred及更大scale有语法约束与安全整数检查；生产代码没有特定书名、60/58/17等验收数量。编号必须从1连续，Prologue最多一次且在前，Epilogue最多一次且在后。整行Chapter格式才成为候选；普通句子/段内提及不会因为包含chapter one就触发。
- Roman接受规范大写语法及独立空行或标题装饰边界，从I开始连续且至少两项；孤立I、正文弱边界、错误Roman、重复/缺号/目录与正文两套序列均保留完整“未分章正文”并给诊断。不会凭一个代词I猜章界。英文/中文/Roman多套明显候选同样保守拒绝猜一套。
- 仅含空白的前部归首章start0；首标题前有实际叙述则保留“正文序言”段。章节极短不丢。已有中文章回/卷部过滤规则在本helper保留兼容，未借英文修复增加语义判断或重写正文。
- 章界来自逻辑行起点，不在surrogate中间切分；测试覆盖emoji/CRLF/前导空白、完整UTF-8 hash与拼接。手动cuts优先仍由当前core已有入口承担；CH03只证明其原路径保持，不能称新增helper已经接管或重写手动cuts。

未来将helper接到生产 `importChapters` 时仍需在共享文件串行所有权下独立审核/验证诊断传递、manual优先及原文保真；本轮没有进行接线。

## 独立限定执行

仅运行：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-CH0[123]:' tests/unit/novel-import-chapters.test.ts
```

退出0，**NI-CH01/02/03 共3通过、0失败、0取消、0跳过**，约129.5毫秒。CH01包含合成60节及独立延伸到103的通用数字/数词样本；CH02包含I–XVI＋Epilogue、延伸XX及装饰标题；CH03包含歧义/缺号/目录重复/代词I/前言与manual路径。没有扩大为全文件其他名称或全suite。

作者报告的先红3再绿3属实施TDD记录；本审核没有回退实现重做RED，不将作者执行与本次独立GREEN混为同一进程。

## 获准L02只读离线核对

两输入实际SHA-256分别为：

- `输入核验/L02-selected-production-prose.txt`：`58548a4030b4da383b4bddb22948c3218913a0b32110bd89dace4e4c881d0c41`。
- `输入核验/L02-ui-source-map.json`：`71ae53d11259657730768543468bb05dea013d64019f97ae3fae487c961873ff`。

独立Node24只读内存计算调用当前helper，仅输出计数/hash/布尔值：cuts=60、diagnostic=null、`JSON.stringify(cuts)===JSON.stringify(map.cutsForImportChapters)` 为true，全部切片UTF-8拼接等于原输入bytes，前后再次readFile的原bytes完全相同。没有输出正文、写原文/map或调用应用/模型。

这支持当前L02生产文本几何与冻结cuts一致，不能证明DOCX正式导入接线、全部正文/12目标/两线、最终语义/发布。M02本轮只使用事先markers预期与合成Roman17/XX，不读取其实际body，也不宣称M02真实正文自动分章通过。
