# 证据定位窄修复：方案与用例独立审核

日期：2026-10-26（Asia/Shanghai）。审核者：`real_books_test_review`。对象：`08-evidence-fix-plan.md`、03新增`RB-REG02`、现有精确证据校验，以及S01保留的revision22失败快照。方案阶段未运行应用、模型或测试；后续源码复审仅执行下方明确获准的三项协议回归。未修改生产代码。

**方案与用例要求审核通过，可进入NI-A06先红与窄实现。** 实施及code review必须按下述精确边界核对，不代表真实S01失败已修复。

独立只读复查 `failed-before-evidence-fix-rev22.json`：同会话revision22、phase failed、错误“模型证据与来源单元不匹配”，大纲0/13，artifacts为0、publication为空；workingProse与冻结expected-body逐字节相等，2723字符。没有原始失败响应可证明究竟是换行、错误unitId或无根据引文，方案对此保持未知是正确的。

## 精确证据边界

首先按原逻辑接受已逐字包含于所指单元的引文，保留合法短精确引用。只有这一exact检查失败时，才允许做局部版式定位：unitId必须已知；不得跨unit拼接、全书搜索或改指另一unit；不改sourceUnitIds；引用非空白字符、标点、大小写、繁简均不可变化；归一后不少于8个Unicode字符（码点），且恰好一个候选。找到后从原unit按真实边界切出原始连续substring，保存该原文quote，再走现有exact校验及后续引用校验。

版式映射只允许Han-Han之间排版空白省略；其他间隔保守保留一个空格，英文/数字词界不得合并。不能把`now here`变成`nowhere`，不能删连字符、标点或做Unicode兼容替换。码点计数与JavaScript源索引是不同单位，映射必须保存正确的UTF-16切片边界，不能拆代理对。多个候选即使互相重叠也属歧义，不能只以第一次命中或非重叠计数断言唯一。

以上只是把模型引文的版式定位回原文；最终引用仍逐字来自源单元，语义支持仍须独立反查。不得因此把“拥有可定位引文”当作设定内容正确。

## NI-A06应落到的断言

| 范围 | 必须断言 |
| --- | --- |
| 中文正例 | 软换行/版式空白定位成功后quote严格等于原始连续源片段 |
| 英文与混合字符 | 空白折叠保留词界；合词、改大小写、标点、连字符或繁简变化拒绝 |
| 身份与范围 | 未知unitId拒绝，即使引文存在于别的unit；仅跨unit组合才能成立的引文拒绝 |
| 唯一性与长度 | 多候选（含重叠）拒绝；少于8码点的非精确引用拒绝；原本合法短exact引用仍通过 |
| review | conflict的evidence使用相同定位与exact门槛，不能只有analyze生效 |
| 输入与后续校验 | source单元、正文输入及sourceUnitIds不变；NI-A03原伪造证据/引用反例仍拒绝 |
| 实际失败诊断 | 仅报告unknown-unit/too-short/ambiguous/no-match等形态及无敏感数量，不输出引文、原文或Key |

NI-A06不应镜像实现细节断言，而应以输入/输出行为证明上述边界。允许仅运行明确`NI-A03/05/06`，不扩为整个测试文件或全仓；合成协议正例不能计真实小说通过。

先保留失败测试，再窄实现、限定转绿、独立code review和构建；然后正常关闭/重开，沿同S01源hash/目标/session真实重测，保留revision22和新构建身份。若下一真实回复仍有错误，应根据形态诊断继续记录实际失败，不能通过扩大匹配范围或替换unitId凑成通过。

## 源码与限定回归独立复审

**源码独立审核通过，可构建并恢复同S01检查点真实重测。** 审核范围为`desktop/service/novel-import-ai.ts`新增`evidenceLayout`/`anchorEvidence`、接入点及`tests/unit/novel-import-ai.test.ts`新增NI-A06；没有发现本次窄改的阻断问题。

实现用码点遍历保留每个原字符的UTF-16 start/end，只有Han-Han间空白被省略，其余折叠单空格，非空白字符不归一化。known-unit与原exact检查在先；非精确分支按非空白码点不少于8计数，逐位置扫描包含重叠候选，第二个候选立即拒绝。唯一命中后仅从该unit切出原始连续substring；analyze artifact和review conflict均先定位再走既有`validateImportEvidence`精确包含校验。错误只含固定形态码，不含原文。返回处理基于schema解析结果，未写入request来源或正文；NI-A06也断言成功分析时request和原raw对象保持不变。

NI-A06以行为覆盖中文换行与英文空白恢复、短exact保持、8个astral Han码点可定位、7个拒绝、未知ID、英文词界合并、重叠多候选、改字/大小写/繁简/标点、跨unit及review路径。NI-A03继续验证伪造证据及角色/事件/章节引用拒绝，NI-A05保持阶段契约边界。

独立执行命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='NI-A0[356]:' tests/unit/novel-import-ai.test.ts
```

结果exit0：3 tests / 3 pass / 0 fail / 0 skip，duration 157.297667ms。仅执行NI-A03/05/06，没有运行整个文件或全仓。复审文件SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| `desktop/service/novel-import-ai.ts` | `7b35bae5e6438a348bb6606578de51dd89f356f3221cd32cae0e6913ad805829` |
| `tests/unit/novel-import-ai.test.ts` | `666e984e6f72871763d210da5443a0729159e4f3785e4a855f0cbff4db84ce95` |

本轮未运行应用或真实模型，没有把最初revision22根因判为whitespace，没有把协议通过计作真实S01通过。构建与恢复重测须记录新身份；实际十二目标、语义、发布及正常持久化仍等待真实产物独立验收。
