# 场景输出容量独立代码审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。依据276/277及其独立审核，仅检查本次两处容量接线及结构化场景专项测试；未参与实现或测试编写，未读取真实小说、配置、Key或私有请求，未调用模型。CodeGraph工具未暴露，直接读取已指定文件。

## 结论

**审核通过，无遗留阻塞。** 额度只在既有eligible严格scene合同且实际role容量充足时显式增加，原输入/输出内容、默认请求行为和校验/次数上限保留。可在主代理受影响回归及构建通过后继续同R16目标只读实际出站验证，再以全新会话完成全部导入流程。

## 实现核对

- `src/lib/ai/generate.ts`只新增内部可选maxOutputTokens；传给streamText时以undefined为界条件展开，未提供则省略该参数，不产生默认32768、null或其它强制值。generateJSON原rest参数会在既有两次生成中保留该显式值。配额/用量、取消、SDK重试设置及原finishReason检查均未修改。
- `desktop/service/novel-import-ai.ts`仅在既有`structuredScene===true`且supportsStructuredScene通过后计算新额度。实际role的pin同时用于能力判断、原输入预算及输出容量，不借用其它role或官方标称窗口。原payload+schema预算和固定提示预留先行执行，没有被新检查替代。
- 容量必须是正的安全整数。计算量为完整`contract.prompt+schemaText`的UTF-8字节数，加原IMPORT_JSON_WRAPPER_RESERVE_BYTES，再加32768；仅总量<=pinned.contextWindow时生成maxOutputTokens属性。空间不足或容量不可用/无效时，contract及下游参数均省略该属性，仍按原默认额度生成。
- 完整prompt已包括实际追加索引的payload和全部输入，服务器schema另行计入；没有重新切片、裁units/目录/别名/引文选项，也没有截取text或facts。只调整请求允许的输出容量，不把未完整结束的结果当成功。
- 原严格wire→canonical、全部业务/身份/引用/证据和末端授权/快照/取消门未修改。incomplete仍按原JSON桥两次失败；未新增外层请求、模型降级或网络重放。原结构错误最多两请求四生成的既有路径仍由专项覆盖。

## 独立执行证据

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-structured-scene.test.ts
git diff --check
```

最终专项文件**25/25通过，0失败、0跳过，退出0，约7.42秒**；diff检查退出0。未运行全仓测试，不把此前同文件执行的旧数量叠加为新增用例。

- SO-01经真实MockLanguageModelV4检查generateText/generateJSON的SDK maxOutputTokens；未显式设置时保持undefined及原文本模式。
- SO-04经真实Responses SDK与合成ModelService/ModelGateway捕获两次结构纠错请求，均实际发出max_output_tokens=32768，并保持同模型/端点、strict、reasoning none和store false。普通生成实际body不新增上限；HTTP400保持单次请求。原modelRecord和providerOptions不变，合成Key只由主网关注入。
- OC-03使用中文及非BMP大元数据，证明UTF-16计数不足；精确UTF-8总量边界少1不增、恰等及多1可增。较小review窗口不借较大text窗口，text无关时足够的eligible review窗口可增；undefined、0、负值、NaN、Infinity及小数均不增。每例先确认原预算通过，实际生成一次且资料、目录、别名和全部选项不变，排除了更早拒绝造成的假阳性。
- OC-04经实际生产JSON桥和原canonical门，完整保留大体量text及四原生资料字段。即使返回的JSON完整、可解析且业务合法，finish=length仍两次后以incomplete拒绝；两次SDK均携带同一上限。该测试的10000输出token是合成用量，大字符体量只证明本地不截断，不冒充真实供应商token实测。
- 既有SO继续验证严格拒绝、完整目录/父级/证据、schema预算、有限结构纠错、controller保存及末端授权/快照/取消行为。

本审核不证明真实DeepSeek已采用新额度或整书已成功。后续须实际确认同失败范围的SDK出站max_output_tokens、结束状态/计数、配置不变及正常退出，再完成新会话全文全选场景、完整复核、发布和正常重开逐项/逐章一致性。R16仍是未完成轮次，不以局部恢复或R15成绩代替。
