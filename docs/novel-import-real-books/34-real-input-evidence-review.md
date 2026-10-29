# 真实输入映射与证据工具增量独立审核

日期：2026-10-26。审核者：独立子代理 `cross_platform_picker_design`。

**本轮输入映射与证据边界增量审核 PASS。** 初审发现的缺失导入、二进制/目录元数据降级、证据目标链接、目录显示名及 PDF proof 缺失比较问题均已由主代理修正，最终限定复核通过。该结论不包括后续 SEM 新字段与业务投影审计，不代表实际应用导入、真实 AI、发布、重开或文学语义通过。

冻结工具 SHA-256：

```text
d051aefca37925beaec9d4e3989f59c32dec83712c02c0037ffaa5735d0b462e scripts/observe-real-novel-import.py
30f7e9230176895845ea63da851e1309f5ab1ddc304d9adc29e0ce0b5119a2d4 scripts/audit-real-novel-import.ts
```

本代理只新增本报告。未修改工具、生产源码、原始小说、oracle、映射或任何真实 run；未调用 freeze/observe 真实模式，未读取真实 journal/Usage/Key/模型或打开用户数据库。主代理告知应用正在运行并等待用户解锁，本代理继续只做只读输入与临时隔离检查。

## 独立只读输入复核

用 `PYTHONDONTWRITEBYTECODE=1 python3` 加载 observer 模块，仅调用 `frozen_input`，对下列七个明确输入逐项核验。完整 oracle 的 source/independent hash、complete 状态、正文范围均被检查；S02 使用完整 `S02.json`，没有采用 `S02-incomplete.json`。没有打印或复制小说全文到仓库。

| 输入 | 来源数 | 正文字符 | UTF-8 字节 | 冻结正文 SHA-256 |
| --- | --- | --- | --- | --- |
| S01 | 1 | 2,723 | 7,987 | `b6360470a56ab29b0c8a1e327db72ac552651b206a63b1392dd94749e8381d4a` |
| S02 | 1 | 5,310 | 15,340 | `1df1a42cf45fb494b8758c2bf61260c043bee0e33954888a028abbcbf05e7697` |
| M01 | 1 | 23,257 | 67,549 | `b06de8a2b8ac2e8e2561f6b4fb39d6f15e866001f4af6d3c24e929cb7f87c397` |
| M02 | 1 | 182,372 | 184,144 | `d54f2f4806d149d3540a77b6b4c731083dc3bf340cf037e131ab50f262659492` |
| L01 | 1 | 118,756 | 337,108 | `13e01d3435483075f04a629759a1a2855bd6c7f98367003d23eb3d13c5fac11b` |
| L02 | 1 | 1,105,899 | 1,139,556 | `58548a4030b4da383b4bddb22948c3218913a0b32110bd89dace4e4c881d0c41` |
| M01-directory | 9 | 23,257 | 67,549 | `b06de8a2b8ac2e8e2561f6b4fb39d6f15e866001f4af6d3c24e929cb7f87c397` |

S01 的固定正文 hash 与既有 [S01-publication-01 审核](reviews/S01-publication-01.md) 相同。本轮没有重新执行其数据库审计，也没有改变其历史语义 FAIL、receipt 或 expected-body。

### L01 PDF 映射

独立读取原 PDF、完整 oracle、独立文字、`L01-production-pdf-v3.json`、`L01-ui-source-map.json` 及选定正文。通过两份全文的非空白字符序号建立独立位置对应，不直接相信 map 的 verification 布尔值：

- 原 PDF SHA 为 `fb1a231fc2cf94f38412566ad200d0a6d245ca92cdb6bae565e5329b462e9598`；oracle SHA 为 `2334d6b820071a5df0d402274b38f4d17e82818e00095584f287bb70b45994e1`，保持未变。
- 生产全文123,760字符、独立全文132,930字符；全文111,355个非空白字符逐个完全相同。这只确认预 AI 提取表示对应，不是最终正文的字节验收。
- map 的173项正文内排版页眉，逐项与 oracle 的 layoutNonNarrativeRanges 范围一致；其非空白字符映射回生产位置后逐项相同，页眉内容 hash 也相同。没有额外按模型结果排除正文。
- 174项 includedRanges 与175项 excludedRanges 互不重叠，按序精确分割完整 `[0,123760)`，连空白字符也没有未记录间隙。选定生产正文区间为 `[890,123759)`，只去除已冻结页眉；拼接每个生产切片的原始字符，UTF-8 字节严格等于选定正文文件337,108字节。
- 选定正文109,176个非空白字符严格等于 oracle 正文去除相同173项排版范围后的内容；最终基线保留了所有选定生产字符，没有对选定生产正文做空白规整。
- production 保留178项有序物理页台账，177页有文字，末页 end 等于生产全文长度；源编码 proofHash 为 `41c9e9652712b7a03bf0489fcb711b4c299d255b455094700bfd033fdb39df31`。该预 AI `inspectBytes` 产物的文件系统 proof 为 null，不冒充原生授权文件 proof；实际 journal 的 proof/ledger 必须由后续正式流程提供并被 observer 保留。

对应输入 hash：map `085d2aac308729b8b8b3a9cf5ed5f10ab36c41f4b75b281ff236e349f1baf21b`；production container `f571f18d4223e5ed7087ccbb8d0df22d997447c8f326118e9c9ba67ece4eb006`；production text `df2c0077a06e3935e05b7e9b9bdd802bafae9c2ca2bb79a8c65c80228712c6de`；选定正文 hash 见上表。

### L02 DOCX、M01 目录与章界证据

L02 源/完整 oracle/独立文字/实际生产提取文件均按冻结 hash 只读检查。选定生产范围的原始 UTF-8 字节严格等于选定正文文件；其全部词与标点 token 按序等于独立正文。再次直接解析原 DOCX 的 OOXML：`word/document.xml` 含1,085,360个可见非空白字符，`word/header1.xml`另有22个；合计1,085,382字符按原部件顺序与生产全文完全对应。文档中34个表格段落的文字均出现在生产全文，不能用只读段落正文漏掉表格。这里仍只认证预 AI 表示覆盖，最终章节保真依赖下面的严格字节断言。

M01-directory 的 manifest hash 为 `60764cf0d91b2bc05e036bf575a07ddc66e1ccc9f93b343f3685ddcc9212aa25`。独立枚举确认目录当前恰为9个冻结成员，order 为1至9；各成员原字节分别严格等于原 M01 独立文字的指定 sourceCodepointRange，逐个 hash 相同，完整拼接严格等于 M01 正文67,549字节。修订后的 sourceFiles.name 使用真实 scanner 的 `relative(dirname(selectedDirectory), path)`，保留 `M01-按章/` 前缀；不再用 basename 掩盖真实导入名差异。

L01/M02 的 chapter-preflight 文字 hash、字符数、全部 expectedCuts 与 actualCuts 偏移逐项核对，分别20/17节，当前 chapter helper hash 一致。按这些边界切片再拼接严格保持完整输入；M02 特别使用 bytes.decode 保留 CRLF，未让 Python read_text 的换行规整改变基线。章标题编号在对应边界可定位；不将此组件预检记作正式 UI、AI、发布或业务章节验收。

## 初审问题及关闭依据

| 问题 | 修正与独立复核 |
| --- | --- |
| P1：二进制切片分支使用未导入的 safeImportBoundary | 主代理补入真实 core 导入，避免 L01/L02 运行时 ReferenceError。主代理另用专用 extends 配置只检查 audit 脚本，报告 exit0；普通项目 tsconfig 不含 scripts，因此其全项目 tsc 不能充当该脚本类型证据。本代理核对导入与调用，未执行真实数据库审计。 |
| P1：缺少 bodyRepresentation/sourceFiles 可降级跳过映射 | observer 与 audit 对 L01/L02/M01-directory 强制要求两字段，才进入后续完整 map/manifest/hash/切片检查；四个旧文本样本保留原兼容路径。实际 guard 的限定合成负例拒绝缺失字段，不再以 metadata 缺失放宽。 |
| P1：自己 run/输出叶缺少目录与链接防护 | run 标识、resolve/目录约束、O_DIRECTORY/O_NOFOLLOW、dirfd 打开及普通文件 nlink=1 校验已接入。expected/oracle/build/checkpoint/JSONL 同样使用 helper；临时文件在同一 dirfd 写入、fsync、原子替换，拒绝既有 symlink/hardlink 叶。JSONL 保留原格式与所有原历史。隔离负例验证外部 sentinel 无变化。 |
| P1：文件夹真实显示名与冻结 basename 不同 | observer 冻结真实相对显示名；audit 限定固定 M01 目录、直接父目录、完整相对名、9项路径/名称唯一与顺序、manifest 绑定及每成员原字节。实际7输入重算后名称与 scanner 规则一致，没有放宽成任意 basename 匹配。 |
| P1：PDF proof 两边缺失时 undefined===undefined 可过 | L01 映射冻结 proof 与当前 proof 均须为有效64位小写 hex 字符串，再严格相等；旧 PDF core 可选字段的兼容不会使这次 L01 新输入丢失源编码证据。实际分支合成负例覆盖同时缺失/单边缺失/空/null/非字符串/非法字符/不同 hash。 |

## 证据隔离与限定边界检查

主代理明确授权只在临时合成 corpus/JOURNALS 执行 RB-IN01/P01 输入边界负例。Python 通过独立 namespace 加载真实 observer 并仅替换该 namespace 的 CORPUS/JOURNALS；真实两个目录常量未被访问或修改。临时目录由 TemporaryDirectory 回收，没有创建真实 run。

- observer 共12项明确断言通过：缺失三类 representation 拒绝、连续两次观察保留全部 JSONL 历史、PDF proof/ledger/决定投影保留、run 目录 symlink 拒绝，以及 run.json/latest-checkpoint.json/observations.jsonl 各自的 symlink/hardlink 叶拒绝，外部 sentinel 原字节均不变。
- audit 只用 TypeScript AST 抽取并执行真实、位于用户 DB 接触之前的元数据 guard；三样本×缺两项/缺sourceFiles/缺representation共9例拒绝，S01/S02/M01/M02四旧文本兼容正例通过。没有执行 main 或 Workspaces。
- PDF proof 的真实完整 if block 连同局部 actualProof 绑定被抽取；8种非法/缺失组合拒绝，相同合法 proof 正例通过。首次合成抽取漏带局部绑定导致正例失败，修复的是临时验证夹具，未据此修改生产工具或伪称生产 RED。
- ambiguous journal 的拒绝在源码核对：候选集合必须恰一项，`len(candidates) != 1` 在任何 checkpoint/JSONL 写入之前抛错；本轮没有为此扩大获准的负例执行集合，也没有枚举真实 JOURNALS。

仅执行的实际 audit CLI 为：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx scripts/audit-real-novel-import.ts --describe-schema
```

结果为63个 migration 文件，静态指纹 `cf231d839c67a5d7e7904ba4185a5f5106b8edd7c870708ff47e59f4fa915d06`，与旧记录一致。该分支在 Workspaces 动态导入/数据库打开之前返回，不计真实数据库审计。

## 最终验收边界

audit 的新输入分支绑定源原件、完整有序 sourceFiles、map/manifest hash、生产全文 hash、UTF-16 安全有序切片与 PDF 源编码 proof；最终 expected-body、checkpoint original/working、checkpoint章节拼接、实际有序 Chapter.content 均使用原始 UTF-8 Buffer.equals。PDF 页审计在最终快照与 `pdfReviewAudit(s)` 严格相等，不以预览成功、非空白相等或存在某字段代替。observer 保留 PDF 文件系统 proof、inspection、决定及预览失败，不复制 endpoint、授权 grant 或 Key。

这些真实数据库断言只做了源码审核，**本轮未执行用户 DB 或发布审计**。后续 SEM 检查点字段、native 业务投影、source-only 未确认映射、知识来源与修订结果的审计增量须用新 hash 另行审核；不得用本报告 PASS 抵充它们。真实 L01/L02/目录导入及所有文学语义仍按独立正式 run 留证，本报告不重写任何旧失败或未执行记录。

## observer 小增量复核：构建身份与纯数据投影

主代理随后仅修改 observer：共用 `BUILD_INPUTS` 记录23条本仓库相对路径，补 worker/PDF/shared/SEM/publisher/Record 源身份，freeze 与 record_build 共用；安全白名单条件增加 `semanticState`、`mappingWarnings`。本增量 observer SHA 为 `79ae8a99ff7bc4614966ac324180789975cd006f6e5df682f6eb7bba2e87e25d`，audit 仍为 `30f7e9230176895845ea63da851e1309f5ab1ddc304d9adc29e0ce0b5119a2d4`。

独立静态复核 BUILD_INPUTS 无绝对路径或 `..`，不新增目录扫描/模型读取；semantic checkpoint 的现有接口及严格外层结构是决定锁、分片工作项、覆盖与轮数等耐久纯数据，未引入 grant/模型配置字段。另在临时 namespace/corpus/JOURNALS 中执行一次仅合成投影：state/warnings 原值保留；合成 analysisGrant/classificationGrant 不出现于导出，models 内 endpoint/authRevision 也继续剔除。没有访问真实 journal、应用或数据库。

**该小增量条件复制与构建身份记录审核通过。** 它只证明证据保存范围与敏感字段边界，不能证明 SEM 工作项、业务投影或文学判断正确；本报告原有后续 SEM 审计未获通过的边界继续成立。
