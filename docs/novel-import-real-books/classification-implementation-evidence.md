# 45/46 来源分类窄修复实施证据

日期：2026-10-26。只改 AI-payload、main 和新增 classification unit 文件；47 另行独立代码审核。本轮没有操作应用 17542、C1/其他真实 journal、原件、用户配置/DB、模型、UI、发布或 observer。S01-C1 rev5 的真实分类质量 FAIL 保持；合成 adapter/controller 通过不代表真实分类已修好。

## 最小变化

- 只有 `semanticVersion:1` 的 classify 使用独立来源用途提示。固定规则逐项列出合法 kind：原作叙述/对白/动作/描写/回忆/背景仍 body；已经单列的角色卡、世界资料、大纲、主题、文风、场景、物品、伏笔、金手指、爽泪点、事件编年和叙事安排才用对应类。不混 native 提取、facts 或两线生成规则，不按人名/关键词/语言/扩展名强制 body；不确定 unknown、不能擅自排除附属内容。
- 新 semantic classify 在发送副本中把每个 unit.kind 置 unknown，保留其余字段、全部字符、范围、ID 和顺序；序列化与实际 options.ai 边界使用同一窄 helper。源 journal 的旧 kinds 在 pending 和非法响应期间不变；只有完整唯一合法响应才按既有原子 checkpoint 提交。合法 world/unknown 不会由代码改成 body。
- `classificationSourceHash` 仅 semantic1 增加 `classificationContractHash`：对 `importAiPrompt({semanticVersion:1,phase:'classify',units:[],artifacts:[]}, '')` 固定部分求 SHA-256。它使用原 checkpoint 字段，不加 journal 新字段，也不进正文/plan/semantic hash。旧公式分支不加缺省字段；同一契约继续保留成功批次。
- 所有 legacy 提示/载荷及其它 semantic phase（含 reconcile）保持既有 literal 指纹；预算、来源核对、模型授权、epoch、runtime 原 Promise/停机证明、解析和发布逻辑未改。

## 实施前独立 literal

[独立基线元数据](evidence/classification-independent-preimplementation-literals.json) 在生产文件仍为 payload `9e26d2c5…6051`、main `04ef2051…5147` 时建立。它由手写冻结旧提示字符串、事实字段次序和 Python ordered JSON/SHA 计算，**不导入/调用生产 helper，不把生产新输出生成成期望**。测试中使用其 literal 常量，先验证兼容矩阵再断言新行为。

该基线包含 9 组旧 prompt/payload（其中 semantic classify 预期会变化）、旧语义空 classify 提示指纹、legacy/旧 semantic 分类 sourceHash、91 个原单位几何和 legacy 已保存 workingUnits 几何。C01 实际保留断言的是其它 8 组 prompt/payload；patch 使用原有“空提案拒绝”响应捕获提示，同时保留该原拒绝语义。非空 patch 行为另由批准的 A05 回归保护。

基线元数据 SHA-256：`ad10837cc5979b4b69be428cb363a296c094c3aae35212ad98f6765d3a167850`。一次性独立计算脚本保留在 `/private/tmp/novel-classification-independent-baseline.py`，未作为产品依赖；其中只有旧固定契约和合成资料，没有原书/人物/oracle/模型结果。

该独立脚本 SHA-256 为 `c10112fb1574e40236b4e931f43a83b2d56798c4a677f2ac6e2316106c7fa22e`。实现后的固定新分类契约实际 SHA-256 为 `a39c8a94cccfc000586ae5b619da9e6da16ed15c5b80fb7e17f91d780d4f6aa1`，空 payload 提示 2197 UTF-8 bytes；这是新实现的身份记录，不是倒生成的旧基线期望。

## 真实 TDD 与限定执行

实现前先纠正测试 patch 空响应的既有拒绝预期，兼容矩阵全部通过后，实际 [RED 原始输出](evidence/classification-tdd-red.txt) 为 2 pass/3 fail、3659 ms：C01 仍含 semantic-native-contract；C02 旧错误全覆盖未失效、没有发出应重发的请求。同契约保批和 legacy/0AI 子情形当时已绿。该 RED 在任何生产编辑之前落盘，不是事后变异回放。

最小实现后实际 [GREEN](evidence/classification-tdd-green.txt) 5/5、0 skipped、exit 0，1237 ms。C02 覆盖旧契约全 credit 重开、重新同意、pending/缺漏/重复/外部 ID/非法 kind/跨阶段响应均不改旧 kinds；合法响应才提交；新契约首批成功后暂停、正常关闭/重开、拒授权零发送，再同意仅发剩余原单位；迟到合法响应零旧 epoch 信用。legacy literal sourceHash 和已保存 workingUnits 几何不变。source-only 0AI 是临时合成控制例，不用于把真实 C1 手工标 body 后宣称自动通过。

只执行以下三条批准命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-C0[12]:' tests/unit/novel-import-classification.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[35]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-LB05:' tests/unit/novel-import-session.test.ts
```

- [A03/A05 原始输出](evidence/classification-a03-a05-green.txt)：2/2，0 skipped，exit 0，320 ms。
- [LB05 原始输出](evidence/classification-lb05-green.txt)：5/5，0 skipped，exit 0，1979 ms。
- [必要静态检查](evidence/classification-typecheck.txt)：当前 tsconfig、noEmit、incremental:false，三个 owned 文件 diagnostics 0。

没有执行全文件/全仓、RT/SEM/PDF/browser/packaging 或其它旧 NI。没有构建或实际模型。后续须由主代理正常关闭/新构建/同 C1 会话重开，通过现有授权 UI 对同 26 单元真实重测并独立核对质量；此前失败证据不删除。

## 最终冻结 SHA-256

```text
4bc384917f7a723375090cec38be180e561bfe7b2b5b3fba8317167a4a2098e6  desktop/core/novel-import-ai-payload.ts
b869c4034c9eb86e3cee4f5fee642c5cd25f1b10feeaf7e06549d221672250c9  desktop/main/novel-import.ts
af6ed4761e9fa21c0372158f380f1c60d676c61538fc4199975727d14502558d  tests/unit/novel-import-classification.test.ts
```

其余既有生产/原测试文件没有修改；代码已停止写入，交 47 独立审核。本文不是 C1 自动分类、真实全书十二目标或 RB-P01/LIFE 的通过结论。
