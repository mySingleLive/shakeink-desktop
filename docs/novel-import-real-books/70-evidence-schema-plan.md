# 原文证据定位前置到既有一次纠正：方案与限定用例

日期：2026-10-26。待独立技术/用例审核，未编码。

## 实际失败

S02正式12目标分析在大纲0/6失败，rev26实际UI和检查点均为`模型证据无法定位（no-match）`。不可覆盖`analysis-start-checkpoint-rev26.json` SHA6f01b64efa95f2fa66b4e24c66edc15d6af9658edf060bc098339e21bd04fdee已保存：源与5310字正文一致，manual14保留、reviewPolicy2、6工作单元，产物0/coverage空。没有保存失败raw模型结果，不能推断具体坏引句或原因。没有点击随机重试。

现有`anchorEvidence`已严格接受精确包含，或仅在原规则允许的排版空白处理后唯一定位并恢复精确原文；unknown-unit/too-short/ambiguous/no-match均拒绝。当前普通semanticVersion1 analyze的请求绑定schema只验证evidence字符串非空，定位在generateJSON既有一次格式纠正之后才发生，导致模型无法得到定位约束反馈。

## 唯一生产变化

仅`desktop/service/novel-import-ai.ts`的`importAiResponseSchema`在原已有semanticVersion1、phase analyze、非reconcile的窄分支，为requestedArtifact.evidence增加逐entry本地非变换校验，复用同文件原`anchorEvidence([entry], request.units)`，丢弃其返回值而不改变raw quote或request。任何定位失败只转为固定安全schema issue（路径为artifacts.N.evidence.N），指示引用本次unitId及原文连续片段，不允许概述/拼接/补字；不得回显错误raw信息、unit列表、引句或源文。

原精确/排版规则、>=8非空白字符门、唯一性、Latin/digit词界及UTF-16回映射全部通过同一helper保持，不引入正则近似、文本清洗、跨单元拼接、自动代选引句或容错放宽。原late anchorEvidence/validateImportEvidence、知识/native/引用及main校验全部保留。schema只预检查，不transform，最终仍由原late门恢复精确原文。

生产defaults与测试仍共享generateImportAiJson→原generateJSON，最多原有一次格式纠正，不加重试层/上限，不改网关、prompt保留预算、main、core、UI、模型或权限。legacy、classify/review/patch/reconcile的schema对象和行为不改；后续同类问题另凭真实证据处理，不能顺便扩大范围。

## 限定用例与兼容调整

仅测试文件`tests/unit/novel-import-request-schema.test.ts`新增NI-J03：

- 实际生产bridge+原generateJSON/合成generateText DI：第一次不可定位证据，第二次精确正确引用，恰好2次且反馈固定field path、安全指导，无源/坏quote/模型值/IDs回显，保留相同signal/模型/role/action和wrapper预算；持续坏证据恰好2次后invalid_schema，无第3次；首次正确仅1次。
- 新schema与原late gate等价：精确引句（短/重复精确按原规则）可通过；合法Han排版唯一回映射保持schema原quote，runImportAi晚门才还原原文；不匹配、未知unit、排版too-short、排版ambiguous、Latin词界、跨unit/拼接等仍拒绝。坏kind/来源和坏evidence可分别给固定字段提示，不用一项错误遮蔽另一项。request/raw无变换。
- legacy及其它phase保持旧schema对象和late门；不把此合成bridge结果当真实模型成功。J01/J02原断言保持，唯一预先批准的适配是J02旧“坏证据schema应为true、仅晚门拒绝”项：单独移入明确schema false+晚run拒绝，native和link仍保留原true/晚拒绝；除这项过时前提不改旧断言。

仅两个精确命令，先当前冻结真生产RED再最小GREEN和独立代码审核：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[123]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[356]:' tests/unit/novel-import-ai.test.ts
```

必要全项目/audit类型和desktop build另记，UI/worker不变不全量测试。独立通过后正常退出/新构建重开同S02、原保存目录重授权和分析范围明确允许；比较所有源/正文/14章/预算及成功信用保持，只恢复未完成大纲。rev26失败永久保留；真实大纲/全目标/文学质量/发布重开另行验收。
