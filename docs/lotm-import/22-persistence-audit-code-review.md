# 最终持久化审计器独立代码审核

日期：2026-10-27（Asia/Shanghai）。审核者：独立子代理 `lotm_test_review`。范围为15/16批准的新 `scripts/audit-lotm-import.ts`、`tests/unit/lotm-import-audit.test.ts` 及19实施说明。只读源码及冻结输入元数据；未读取真实应用journal/数据库、模型state、全局库或其它作品，未操作UI或向外发送内容。

**最终复审通过：三项初审发现及内部链接边界均已闭环，独立同组15/15通过；未发现剩余阻断项。** 仅批准新审计器代码及合成定向验证，不代表真实本书持久化或文学语义通过。初审历史与最终指纹如下保留。

## 初审状态

**初版存在三项需修复问题，暂不授予代码审核通过。** 已先报告主代理；主代理明确授权作者仅在新脚本/新合成用例范围按原15/16边界 RED→最小修复。原审计器、生产代码及真实作品不在修改范围。

初审冻结指纹：脚本 `a4c22d387e2e376a4b6c2e61c6cb6715ac3a9f0610a16aa812d7989523f65f9e`，测试 `c5813b07d1531993d96501efbc70c6306b9e4726dcb236195beae73595817593`。本代理实际独立运行唯一新测试文件，exit0，8/8通过，日志 `evidence/persistence-auditor-independent-initial.txt`；代码审核仍发现以下未被初版用例覆盖的边界，不能凭8绿放行。

## 初审发现

1. **required存储标记未按契约校验。** resolveAuditStorage读取required字节，但当pointer存在时不验证其schemaVersion/workId/required:true。合法pointer配合畸形或其它workId的required标记会被放行，未满足15/16的审计要求及workspace-storage.ts的markerSchema契约。应在任何存在时严格解析并绑定workId，AUD06增加“合法pointer+错误required”负例。生产WorkStorage.resolve在pointer已存在时会短路required读取，此处不冒称已实测生产入口拒绝该组合。
2. **scratch/output地址未锚定到引擎前。** 初版创建output和scratch后，直接把字符串路径交PGlite.create，没有记录并重验其canonical路径、目录身份和与原database的真实不重合。若复制后scratch或其父output被替换为指向原DB的链接，引擎可能先跟随链接启动原路径，事后原件hash检查不能消除已发生的写入。应锚定两个新目录，至少在引擎启动前及所有输出前拒绝链接/身份变化/重合，并在合成上下文验证替换拒绝，不触及真实DB。引擎前还须核对scratch内部复制闭包的相对路径/类型/大小/hash及无链接，防止顶层inode未变但内部pg_wal等被替换为链接；复制后的inode与原件不同，不应直接比较两边inode。PGlite启动后合法写scratch，不再要求其内容与原件相同。
3. **规划投影有字段漏检。** 初版没有完整核对reading line人口/身份、volume/chapter.line、chapter.wordBudget及非空章节大纲卡的title/line/telling.id/source；这些字段可被有效改错而仍给mechanicalPassed。需按生产消费契约比较，并在AUD04加入最小字段负例；正例至少包含一项非空章纲，以实际覆盖大纲卡分支。

其余已核对的方向合理：脚本不导入Workspaces/Prisma启动，不打开原database引擎；原件O_RDONLY读取与闭包稳定性、只在副本READ ONLY事务执行固定novelId参数SQL、完整迁移和构建身份、1394章/8卷双正文等值、八类消费helper/多重集及单回执边界均已纳入。后续以重新冻结版本再作源码复审和同组独立复验，追加结论，不抹去本初审历史。

## 最终冻结复审

主代理授权作者按原15/16范围补充实际RED并最小修复后，本代理重新读取修复代码及新增用例，独立复验前后指纹一致：

| 文件 | SHA-256 |
|---|---|
| scripts/audit-lotm-import.ts | `12c3a00e43f2f525dadbe40d1bb49b7fb536989bc29eae585fcfe856ef560c62` |
| tests/unit/lotm-import-audit.test.ts | `7d855e7e520b1f30df39e68886064da8d6eaf9f62500839bb0dedd1bef44aa04` |

三项闭环核对：

- required存在时始终strict解析schemaVersion1/workId/required:true，额外字段及不同workId均拒绝；合法pointer配错误required和对应正常组合均有定向断言。
- 创建output/scratch时捕获父目录、两叶目录及原source目录的canonical身份；复制步骤还守护已建父目录。复制完成将scratch按相对路径/类型/大小/hash与原闭包比较，再保存scratch自身完整身份闭包。引擎factory前先核对顶层锚点、完整scratch闭包且无符号/硬链接，再核对顶层锚点；引擎只收到已校验scratch路径。后续输出前后继续守护顶层，允许引擎正常改变自己的内部文件。四类合成替换（scratch/output整体、内部pg_wal目录、内部PG_VERSION文件）实际均在factory调用前拒绝，计数为0；测试未借真实DB构造这些场景。
- 阅读线恰好一条且身份/名称/primary明确；volume/chapter.line、wordBudget及非空章纲卡title/line/telling.id/source已按消费契约核对。fixture新增非空chapter.outline，实际经生产合成发布生成卡，再对各字段作有效但错误的负例，均不再获得机械PASS。

## 最终独立命令及边界

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/lotm-import-audit.test.ts
```

实际exit0，**tests15/pass15/fail0/cancelled0/skipped0**，duration38980.021708ms。日志 `evidence/persistence-auditor-independent-final.txt`。仅此新AUD文件及其随机临时fixture，未运行全仓；初版8绿与此次15绿属于重叠验证，不能累加为业务数量。

已核对19追加的RED/修复说明及最终清单，与当前代码和本代理结果一致。固定CLI仍绑定本run/session/作品路径和冻结run hash，无任意SQL/数据库路径入口；测试函数显式传独立上下文，没有默认回落真实目录。正常关闭、最终构建/完整迁移/PGlite版本、来源B及派生基线、完整coverage/语义检查点、原生正文/映射及单回执门保持；原件在SQL引擎关闭后、输出前重新校验，PGlite从未得到原database路径。没有读取模型state、global/inbox或其它作品；其陷阱正例及输出脱敏断言通过。

`retryExerciseStatus`继续为not-exercised，不把合成发布重试或单回执当成本书实际过程。实际本书尚未运行此审计器；正式执行仍须completed、同最终构建身份、有效正常关闭证据和全部其它门槛满足后由主代理操作。机械PASS也不能替代真实重开与八类文学正确性审核。
