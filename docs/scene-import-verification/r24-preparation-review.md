# R24验收准备记录

2026-10-31，`scene_fix_review`独立于主代理构建执行准备与字节/哈希核对。仅生成身份记录、复制私有校验脚本并做语法检查；未启动App/模型、连接旧端口、执行验收或修改产品/测试/构建，未覆盖R23证据。

- `build-identity-r24.json`按R23清单重算全部当前文件，加入`desktop/core/novel-import-review-bindings.ts`与`desktop/core/novel-import-review-tasks.ts`，共18项。实际运行包ID仍为`ink.shakeink.lotm-verification`，二进制SHA仍`c9da78c3c79b9e6d6714fbf2a1136c4eb4a93cc5edad0f8ccfb058d681325e7e`。
- `r24-observation-identity.json`确认已审hold driver及数字observer与R23逐字节相同；driver沿用原文件名`run-r23-review-conflicts-hold.mjs`，由环境设置R24标签/目录，不改验收门。继承的numeric bootstrap明确标为历史R21结果，`r24PreflightExecuted=false`，不冒称本轮已运行。
- 私有`verify-r24-snapshot.mjs`仅把R23 evidence/target路径换为`scenes-r24-complete`、`SCENES-R24`。反向替换后与原R23脚本逐字节相等；completed、work/novel manifest、真实active workspace数据库、全量资料字段/证据/schema及完整正文、零skip/drop、只读事务门全部保留，脚本0600。
- 通用`verify-scene-final.mjs`及其`check-r22-final-coverage-template.mjs`存在，供R24设置`LOTM_SCENE_EVIDENCE_ROOT=/private/tmp/shakeink-scene-import-20261031/evidence/scenes-r24-complete`使用；没有改用旧R12脚本。它要求正常发布/退出、原件及卷章正文、完整body/facts覆盖、零待处理冲突/遗漏及原所有任务/父级门。

冻结哈希：

| 文件 | SHA-256 |
|---|---|
| build-identity-r24.json | f6edbaba80279a1c3a30b6f9e7d6f7a715143e2a02c2942bebec555d8c7a6358 |
| r24-observation-identity.json | d38d293986ce187f5f7d57251fa0f39aa724dc4da36f599ef4ca0a681d945f0d |
| dist/main/index.cjs | 42856293d61a65db428ee060735c20f015c2b5950a49b40131b8002abac0be82 |
| dist/service/index.cjs | 191d6c7a3c6c8c18b55b40a1286a1900914803cb239088a65f20c978d7df7ee8 |
| run-r23-review-conflicts-hold.mjs（私有） | f99c3b8bec94b589837d9459db4061701baa42b98cb9278e32a10cb3dc2fdd22 |
| observe-scene-heap-numbers.cjs（私有） | d0d0aa99cc64d09e52865f211149605f267829935ce15caf9aa64c833c2c7095 |
| verify-r24-snapshot.mjs（私有） | 47d4385286f7e0d477675eea39c3394816ab4ffc9abfe782e1a1b6ecfe098f60 |
| verify-scene-final.mjs（私有） | 31552ceaf723b280177eea97ac295b9b0b8208949adc7c30d153fc60c24ee688 |
| check-r22-final-coverage-template.mjs（私有） | bd74da1b27522917228891ef6df8d29038f1ba36ab29fecd7d68cf33561ccf3f |

各私有文件位于`/private/tmp/shakeink-scene-import-20261031/`。详细路径/哈希清单与启动环境需求写入该目录0600的`r24-acceptance-preparation.json`；R24 evidence和target尚未预建，避免干扰driver的独占新会话目录检查。

执行Node24 `--check`检查hold driver、observer、snapshot、通用final及coverage helper共5文件，退出0；只读哈希/反向替换断言通过。未执行这些文件，不产生模型调用或数据库访问。正式重开脚本仍需实际R24 appRoot、published checkpoint及新建的private reopen output目录，并须在正常发布/关闭后才运行。
