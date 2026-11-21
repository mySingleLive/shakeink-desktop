# 真实物品证据失败与叙述归属问题：提示约束窄修

日期：2026-10-26。待独立技术/用例审核，未编码。

## 真实依据

S02 rev58物品在原一次结构纠正后仍失败：`模型返回结构不完整（artifacts.5.evidence.0）`，`item-evidence-schema-failure-rev58.json` SHAe42d35ed32123cbe81f5740ebc227c7a80b4f72520f9e68a682de35f9bd5e5e8。无raw返回，不能判断该条属于unknown-unit/no-match等哪种具体定位失败。大纲1、角色5、场景6及各6coverage与rev55逐对象保持，正文5310/14章不变。没有再次随机重试物品。

独立部分文学报告S02-C1-partial-outline.md和S02-C1-partial-characters-scenes.md分别SHA9fdfc5…37636、aa1e08…ac086。明确发现框架层遗漏、诊断从叙述者判断错写为被描述者自述、重要关系/转述者/参与者缺卡。报告只评价当前部分产物，不宣称未来自动审核会修好。

现semanticPrompt仅要求quote逐字，不如legacy提示具体限定优先短连续引文；知识合同有可靠性标签，但没有明确区分嵌套框架、不同说话者及其判断的归属。仅固定提示补足现有约束，不改校验或小说本身。

## 修改范围及通用要求

仅`desktop/core/novel-import-ai-payload.ts`中semanticVersion1的analyze（包括reconcile）与review固定提示，新增简短的通用证据/叙述归属要求：

- 从声明unitId的同一原文单元选较短连续片段，优先10–30字符，必要时短于10也须原样存在；尽量使用单行，若含换行须用JSON转义原样保留。逐条核对unitId与quote配对，不跨单元、不概述/拼接/改标点、不用长段替代定位。不能为通过校验省略有证据的真实目标，不能编引文。
- 区分框架、主故事、回忆、转述等叙述层以及说话者/观察者/被描述者，保留各自时间和信息来源。叙述者判断、转述的诊断/身份/经历不能改成被描述者自述或无条件客观事实；读者推断仍标推断。
- 有实质叙述/关系/证言作用的框架人物、转述者和仅被提及的关键人物不因不在主线现场而漏掉；来源不足的身份/意图不凭社会常识补造。大纲保留有实质作用的框架、时序和未定结尾；未实际到达的目的地或所述地点不能写成已到访。
- review继续按现有reviewProjection范围判断，不能把未展示或未验证片段说成全书缺失；reconcile仍只改明确目标、字段和证据，不动正文/锁定值。

不得包含任何本次小说名、人物名、诊断原词、具体故事答案、oracle/erratum或人工审核发现的具体原句。只把普适原则放固定指令；所有源文/自由要求仍在原untrusted数据封套中。不能提高正文/目标/提示/JSON wrapper预算、改变payload数据/单元/引用/校验/输出结构、重试、网关、模型或授权。

legacy提示、semantic classify及patch逐字不变。原anchorEvidence、请求schema与全部晚门完全不动。仅新提示适用未来未完成分析/未执行审核；已成功artifact结构信用不自动清除，已有文学问题仍待整书审核及独立复核，绝不因换提示就回填通过。

## 限定验证

仅测试`tests/unit/novel-import-ai.test.ts`新增NI-A07：经真实runImportAi依赖接点捕获发送的固定提示，用合成框架/转述/不确定结尾与恶意自由指令资料，验证新固定合同位于不可信payload外且在analyze/review/reconcile实际路径出现，原source/payload/units/角色/证据/输出/signal不变；reviewProjection和reconcile限制保留，正常旧数据仍原门。所有sem1相关phase及长/非BMP/转义源下固定提示+原wrapper满足原预留，不提高常量；legacy、classify、patch及序列化在真实基线做逐字保护，不把词面断言当文学质量通过。

先真实生产基线新增用例RED，再最小实现/GREEN及独立代码审核。仅三条精确命令，不全量：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[3567]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J03:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM04:' tests/unit/novel-import-semantic.test.ts
```

必要类型及desktop build另记，无UI/worker变更不重构建和全量。通过后同S02正常关闭/新构建恢复、原目录与分析范围重授权，逐项核对12成功产物及覆盖/原文/14章/预算保留，仅恢复未完成物品。真实物品有效证据、余下目标与整书文学问题须实际重测；若再失败继续保留并定位，不无限随机重抽，不投喂oracle答案。
