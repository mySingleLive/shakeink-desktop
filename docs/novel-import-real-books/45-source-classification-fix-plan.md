# 真实正文来源误分类的窄修复与限定用例

日期：2026-10-26。状态：待46独立方案/用例审核，不进入编码。对应RB-S01、直接影响同批其他真实小说的识别阶段。

## 真实失败与范围

S01-20261026-C1使用最终运行时构建和当前DeepSeek模型完成首次识别，26单元全部获得classify覆盖，但正文13单元/2723字符全部误标为world、character、theme或narrative，body为0。完整原文、独立基线及不可覆盖rev5检查点均已保存；独立质量结论见`reviews/S01-C1-classification.md`。协议成功/coverage齐全不能代替分类正确，原结果维持FAIL。

当前semanticVersion1的classify只有kind输出契约，同时附全套native提取/世界线/叙事线规则，没有区分“来源本来是什么资料”与“正文可推断什么设定”。这是可确认的设计缺口，不宣称已证明模型错误的唯一因果。修复须用同一原件和当前模型真实重测，不反复随机重抽，不靠人工把整本改成body来宣称自动识别通过。

## 最小实现

仅修改`desktop/core/novel-import-ai-payload.ts`、`desktop/main/novel-import.ts`，新增单独`tests/unit/novel-import-classification.test.ts`。无UI、service/gateway、模型配置、预算、解析器、发布、正文或oracle修改。

- 新语义会话的classify使用独立固定来源用途契约：原作叙述、对白、动作、描写、回忆、人物/地点/社会背景仍属body；只有来源中已经单列的角色卡、设定资料、大纲/梗概、主题、文风、场景、物品、伏笔、金手指、爽点/泪点、事件编年/世界线表、叙事安排记录，才用对应类别。逐个列出允许kind与含义，标题连同实际小说章节可属body；不确定为unknown，不擅自剔除版权/注释等边界。不从本书、人物名、关键词、语言或文件扩展名强制判定body。
- 该阶段只返回classifications，逐输入unitId完整一次；不提取facts/artifacts、不推断补全、不混入semantic-native-contract或两线生成规则。资料/自由指令仍是不可信输入，不能改变系统契约。selectedTargets是后续计划，原unit.kind是既有初判，不是该段有独立设定材料的证据。
- 仅在新语义classify的请求副本把unit.kind中性化为unknown，逐字保留unit id、fileId、start/end、text及原顺序；不改源journal里的既有分类，直到完整合法批响应按现有原子检查点提交。旧会话、其他phase及其payload/prompt保持原样。
- 新语义`classificationSourceHash`增加固定classify契约指纹（对`importAiPrompt`的新语义classify空payload固定部分求hash），防止重开后静默沿用旧契约的错误覆盖。它不是正文/plan/semantic hash，不增加journal新字段；现有classificationCheckpoint.sourceHash本就持久化该身份。无semanticVersion的legacy公式逐字不变。同一新契约的正常暂停恢复仍保留成功覆盖，源/边界/模型授权校验不放松。
- C1在原会话内重测：保留rev5失败证据，正常退出/构建/重开，保存独立新构建身份；通过现有识别授权UI重新识别同26个原单元。新契约指纹使旧覆盖失效，不手工改源文件/草稿/边界、不注入响应、不删除此次失败。真实修复后识别另留不可覆盖检查点并独立审核；之后只按事前oracle核对首尾附属内容范围，再执行全部12目标、发布和重开验收。

## 限定用例（先审核，后TDD）

| 名称 | 必须覆盖 |
| --- | --- |
| `NI-C01: source classification uses a separate contract without changing other AI phases` | 经真实runImportAi适配器捕获prompt：新语义classify只有来源用途规则及合法输出；没有native提取契约，完整源字符/ID/范围/顺序不变，不能因返回某种资料而由代码强转body，非法/越权结果仍拒绝。固定提示预留仍通过。旧classify与新/旧analyze、review、patch（含reconcile）以实施前独立冻结literal hash断言不变。合成adapter不证明真实AI分类质量 |
| `NI-C02: changed classification contracts invalidate old credit while matching contracts resume` | 临时目录真实controller+可控RPC：旧契约指纹的坏分类检查点重开/重新授权后重新发送全部原单元、请求副本kind全unknown且文本/范围未变；新契约中已成功批次在暂停/重开后不重复，只补未完成；原Promise与旧epoch无迟到信用。legacy分类指纹与工作几何保持旧值，source-only仍0AI；不读用户配置/库/journal |

只运行上述新文件两个锚定名称及直接相关旧回归，禁止全仓/目录suite：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-C0[12]:' tests/unit/novel-import-classification.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[35]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-LB05:' tests/unit/novel-import-session.test.ts
```

必要typecheck/build另记，不将静态/合成通过算真实小说通过。实施前保留新用例真实RED，窄实现后GREEN，再独立code review。实际同源重测若仍错必须如实失败，不把手动校正或coverage计作自动分类通过；长篇/其他格式全流程仍未完成。
