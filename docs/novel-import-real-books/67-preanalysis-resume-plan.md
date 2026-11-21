# 分析前草稿重开恢复：窄修方案与用例

日期：2026-10-26。待独立技术及用例审核，尚未编码。

## 实际阻塞与原因

64–66章界修复构建后，S02同一草稿正常重开显示“导入已暂停”。实际UI点击“继续导入”报“请重新选择并授权保存目录”，仍停在暂停页且没有目录选择入口。该草稿在关闭前为select，未选择target、未开始设定分析、没有产物；不能丢弃或改journal绕过。

`desktop/main/novel-import.ts`的resume中，57引入的semanticVersion1旧reviewPolicy检查在原有source/select/confirm恢复分支之前。当前尚未分析的草稿没有analysisCheckpoint，needsAi为true，因此被提前送入start，后者因无target拒绝。原来用于恢复核对步骤的分支无法到达。不是保存目录损坏或来源丢失。

## 仅允许的修改

仅修改该resume中reviewPolicy前置条件：明确排除resumePhase为source、select、confirm的草稿，和既有recognizing排除并列。它们继续经过现有pending冲突检查及原核对步骤恢复分支。原targetNeedsAuthorization及publication检查仍在前，不能绕过目录重授权/冻结保存；running/failed分析的旧策略迁移、recognized重新同意、冲突及作者锁逻辑不动。

生产范围仅`desktop/main/novel-import.ts`这一个条件；测试范围仅`tests/unit/novel-import-session.test.ts`新增NI-S13。不改UI/core检测器/服务/预算/权限/模型/保存或其它断言。不得用consent:true触发无意分析，也不得提前为当前草稿创建analysisCheckpoint或伪造reviewPolicy2。

## 定向用例

NI-S13用隔离真实controller和合成文本，经实际choose/分类/select/set-title操作准备source、select、confirm三种核对阶段，各选全12 targets、infer=true。未选target情况下正常close→新controller initialize→resume(consent缺省)必须回原阶段，无AI、无publish，既有源/units/正文/chapters/选项/coverage/产物/决定不变，resumePhase清空。

另确认有target的分析前草稿重开后仍先进入confirm提示重授权，不能凭本修复恢复为targetReady。旧running分析迁移与提交边界继续由已有NI-R02原断言保护，不新增生产旁路。NI-S12继续保护64人工章界。

仅执行下列两个精确命令，先现生产真基线S13 RED，再最小GREEN及独立代码审核：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-S1[23]:' tests/unit/novel-import-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-R02:' tests/unit/novel-import-semantic-session.test.ts
```

全项目/audit类型及desktop build另记；UI未变不重构建，不全量测试。独立审核通过后正常退出并启动新构建，同S02从暂停页真实恢复select，再执行既定14阅读单元保持后验。当前实际失败永久保存，未计64实际成功/正式LIFE/整书通过。
