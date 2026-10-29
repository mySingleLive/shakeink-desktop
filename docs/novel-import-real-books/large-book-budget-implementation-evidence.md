# 长篇预算实施证据（待独立代码审核）

日期：2026-10-26。依据18方案及19独立PASS完成TDD窄实现。此记录不表示真实长篇、PDF、六书语义或性能验收通过；本代理没有调用真实模型、数据库、CUA，未构建/重启应用，未读取私有journal或Key。

## 实现与边界

- 新纯helper负责显式v2字符预算、冻结角色profile、严格校验、默认100/可选300单元的批次，以及仅首次新v2工作正文的相邻安全合并。所有既存workingUnits原样返回，来源分类units不合并。
- 旧会话不补v2；在撤销grant/刷新展示models之前捕获legacy几何。角色容量不足或已有分析覆盖却没有可验证旧grant/绑定时明确阻断，保留原成果，不猜测新分片。低容量模型不会阻断无AI的纯拷贝。
- main/shared/core/publish在PDF后端正式冻结交接后串行接入。v2策略/工作单元manifest条件参与新scope/plan及发布审计；legacy私有执行绑定不进入旧hash或旧publicationRecord。原PDF页门控、源前后核验、failure lineage、registry取消/drain/close分支保留，main/index未修改。
- 同一无IO helper构造实际相关实体/父闭包、全局章节index和完整payload，控制器预检与worker最终复验共用。源≤B、facts内容≤2B、完整JSON≤3B；固定提示与实际结构纠正的64KiB工程预留有合成捕获断言。
- 仅v2按完整元数据贪心拆网络包，单任务仍超限则失败；封包前过滤已成功unit/key。全文review和全部设定text/facts/证据任务保留；完整响应、全部冲突证据/引用及epoch有效后一次checkpoint。暂停/失败/迟到响应不增加credit。
- observer仅条件导出policy/legacy几何并增加仓库代码身份；audit复用纯任务枚举，保持原单原件、own work/novel、正常关闭和只读事务边界。没有顺带增加DOCX生产map或目录导入支持。
- 按root额外指令修 `reportPdfFailure`：只接受同session/file/page/sourceKey最后一次成功颁发的requestId；保留issued历史revision有效性，没有改成严格current revision。相关PDF用例由后端代理按其授权范围复验，本代理未运行PDF用例。NI-L04 AST fixture的依赖注入修复已明确交回后端单文件测试owner，本代理未改生产关闭逻辑或该fixture。

## TDD与限定执行

第一阶段NI-LB01/02/06因缺新helper/大请求被旧12k闸拒绝而红，窄实现后3/3绿；NI-LB03、09各自先红后绿。控制器NI-LB04/05/07/08/10首轮输出1通过、12失败，实施冻结策略/恢复/元数据封包后转绿。补充低容量pure-copy及无效owned profile错误分类负例同样记录红→绿。重复文本分片按有序确定性key及任务多重集核对，不按相同artifact/text hash反查单个任务。

最终仅执行下列新增名称；没有执行旧NI、全文件、全仓或通配suite：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test \
  --test-name-pattern='^NI-LB(?:0[1-9]|10):' \
  tests/unit/novel-import-ai.test.ts \
  tests/unit/novel-import-domain.test.ts \
  tests/unit/novel-import-session.test.ts \
  tests/unit/novel-import-budget-policy.test.ts
```

初次交付结果：exit0，tests22，pass22，fail0，cancelled0，skipped0，duration23033.1785ms。覆盖10个新名称及12个子场景，包含约110万合成字符的十二kind/全文复核、所有unit顺序与UTF-8全字节、成功子包后暂停/正常持久化重开、拒绝同意、旧5k/12k、角色升降/授权变化、源范围/目标身份失效、坏policy、完整元数据超限、同ID全部分片/末字段及失败包原子零credit。合成吞吐不作为真实模型性能证据。

对本次13个TS源/测试文件的静态诊断为0；observer用AST解析检查有效，没有执行observer或audit CLI。

## 26/27独审发现后的窄修订

26的LB-CR01指出分类首子包成功后，initialize撤销发送授权；重新同意进入classify会清空coverage，因此原22个绿测没有覆盖该窗口。本轮只修改controller、原session测试以及此实施记录；其余预算/PDF生产文件冻结。

先在NI-LB05/07内新增分类首包成功、第二包在途、pause、正常close/reopen、拒绝同意/容量下降、兼容模型重新同意的持久化用例。精准红命令为：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-LB0[57]:' tests/unit/novel-import-session.test.ts
```

实际旧实现exit1，4通过、2失败（含NI-LB07父项），duration14818.487875ms；新恢复子场景在“仅发送未覆盖的原来源单元”断言失败，首包再次发送。实施后同命令6/6绿，duration17013.922208ms。随后补充来源指纹改变负例，最终仅重跑上文同一NI-LB01–10四文件命令，**exit0，tests27，pass27，fail0，cancelled0，skipped0，duration25737.886792ms**。没有执行旧NI、PDF或全文件测试。

修订只给v2私有journal保存分类检查点：来源几何指纹覆盖原文件/文本、单元ID/fileId/part/UTF-16范围和原文、PDF范围及冻结policy；另一指纹绑定当前全部kind与已成功classify IDs。AI自身更新kind时与coverage同一checkpoint原子刷新结果指纹。重新同意先验证冻结容量和原来源，再同时验证两指纹；匹配仅保留分类成功IDs，不继承其他分析coverage；缺失/不匹配重新完整分类。作者范围/来源动作仍清除检查点。legacy不补此字段，scope/plan算法与授权规则未改。

新负例分别证明作者set-range、include撤销后重新包含、同ID来源正文/原hash改变、成功结果kind被篡改均不能复用旧credit。正例从unknown实际更新为body后仍能恢复，第二包迟到响应不增加credit；拒绝同意和不兼容模型不发送且coverage不动。兼容模型上下文/authRevision变化后仍使用冻结81920/300，首中尾和所有source单元字段、UTF-8字节按顺序完整且恰好采用一次。

同时按root授权修27的PDF-BR01：合法完整扫描且已知pageCount、无来源失效/unknown raster/failed/not-scanned/失败诊断/预览失败的ocr-required允许保存整批非exclude决定（contains-content、uncertain、pending）。任何exclude-image仍整批拒绝；原ledger/source复验保留，PDFReady/AI/publish的OCR阻断未改。其真实controller正反回归由root/PDF后台在NI-PDF06/07执行，本代理没有运行PDF，不在此宣称该独审已通过。

本轮两处修改TS文件用TypeScript createProgram静态检查为0诊断；首次静态调用遗漏incremental覆盖产生配置选项诊断，随后显式incremental:false重跑，未改tsconfig/未生成build信息。重新执行下节同一外部S01快照纯验证，全部断言通过，源快照未写入。后续由root交26/27独立复审；生产controller在本轮最终SHA后停止修改。

## 只读离线及旧S01快照

使用**当前实现**的实际纯函数，重新读取18固定六书原件/oracle及L02生产map，只输出计数/hash，原件SHA逐项相等。分类/每kind分析批次分别仍为：S01 `1→1 / 1→1`；S02 `2→1 / 1→1`；M01 `4→2 / 4→1`；M02 `18→3 / 16→3`；L01独立文字 `17→6 / 16→2`；L02生产文字 `115→17 / 95→14`。基础合计仍 `1886→316`，与18相符；不含facts复核、元数据拆包、重试、人工核对及真实性能。

仅读取root授权的外部脱敏 `执行证据/S01-20261026-0355/latest-checkpoint.json` 与该run冻结元数据做纯函数比较，未读真实journal/DB、未写快照：

- completed、无v2标记；plan hash精确等于原publication.hash：`d51702f08aef8b33b736c6295acb369c9748a20418c6cfd092654528a610faee`。
- analyze scope等于原analysisCheckpointHash；13 workingUnits、57 artifacts、215个结构facts字段、272个reviewFacts任务键完全保留。272为复核任务数，不是结构facts字段数。
- 工作正文SHA等于该run冻结expected-body；工作单元序列、全部artifact对象、coverage及外部快照文件SHA前后不变。

此项只证明新纯逻辑解释同一旧快照时身份/内容未变，不替代重新构建后的真实界面、真实长书或生命周期验收。

## 交付源码SHA-256

| 文件 | SHA-256 |
| --- | --- |
| desktop/core/novel-import-budget-policy.ts | `d4c211b16dfbebc68f292ec10c7ab1f2d895b5b5156f7205908f6ff0c5c3c31d` |
| desktop/core/novel-import-ai-payload.ts | `c55b39bba7e60ef0e84811100dc71a6ce3d904b9d5b939eedd2939ad44c70b9a` |
| desktop/core/novel-import-review-tasks.ts | `2dfea1742a67f70b78b8d33353144dadfb30d13704e4a4ad1f0bbf99848a540f` |
| desktop/core/novel-import.ts | `75efc17677b1322f72ce9e4570d835f511ef82b02d87899225c0c297154db3c2` |
| desktop/shared/novel-import.ts | `3360c883af7b0560ec7d2085cc6e8cd0c01a8519b5a97db146271841d4228526` |
| desktop/main/novel-import.ts | `b4ef686b61b3c7ac08df121bdaf3347bba898ecdbe4c777824155ef19ee25f28` |
| desktop/main/index.ts（交接后未改） | `02da4014d9f4404b71b34a8c0917881d63053dddd25772ed4c2daee098f10778` |
| desktop/service/novel-import-ai.ts | `bd86cc823d9bcf84628fd1fd48b199d9bc4e3f721987af99f0f940af33034a8b` |
| desktop/service/novel-import-publish.ts | `0d49374352c2b010de39c98a71f3f5df7be078950ea8007d6153ba15e957c24a` |
| scripts/audit-real-novel-import.ts | `917db3dd7feebe84aa2a6ba6d43e644bdba9320000a30a0a6572963a698b8ab9` |
| scripts/observe-real-novel-import.py | `b1ef948699943665c130e124c2626759dcb9a7dc401c5508eac15b1f0821d7a2` |
| tests/unit/novel-import-ai.test.ts | `12e208f117202d6cfade828e5cabb65f2f65fe8df256491c15564eea89cf34e6` |
| tests/unit/novel-import-domain.test.ts | `5f2649d2915041b4827d98e3c3914f14448165b4f624e83b700e643233c1f294` |
| tests/unit/novel-import-session.test.ts | `87520622eb43a542c439734731e2260ddadf712571275d604b999c5574cd3dd6` |
| tests/unit/novel-import-budget-policy.test.ts | `b114ce8a083021a348bbfebd0b0afa844f8ed0533c302aea5cff327e9f96f786` |

旧分类完整prompt黄金SHA继续为 `67b3b38985543a7d149d71dd02d61c8b9d37a97bb181a425a251411743e5b158`。下一步由root安排独立code review、PDF组合构建与后续真实M02/L02验证；本代理在该交付点停止修改共享文件，若需修订由root重新指派单owner。
