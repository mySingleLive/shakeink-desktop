# R58 真实观察与strict选项边界独立复核

结论：A正常，B失败；RH04–06未准入，f2e1 WIP预算失败仍有效，禁止normal全文。可另立最小strict选项静态诊断，不能直接改产品。

独立读取安全回执并执行断言：A4854字节HTTP200、stop、directJSON/schema/原tuple/witness通过、delta等于SDK；B1953字节HTTP400、模型JSON校验not-run，完整非截断209字节投影为 `required properties must other all properties in the object other`。此为有损原因线索，不能恢复开放原文或认定唯一原因。exact2、每例生成/fetch1，原始App exit0、无timeout/page error，write0/close成功/metadata写尝试0/状态同。107输入及当前WIP368项和entry/CJS独立逐hash复核一致，不冒作R49旧构建相同或产品已通过。

已安装SDK主源确认：`node_modules/@ai-sdk/openai/src/responses/openai-responses-language-model-options.ts:353` 接受boolean/nullish的strictJsonSchema；`openai-responses-language-model.ts:525` 默认true，603–612将该值写入text.format.strict，schema normalization独立于该值。`src/lib/ai/generate.ts:84、97` 将resolved providerOptions交给SDK。故PRIVATE每case克隆providerOptions.openai.strictJsonSchema=false是SDK支持的路径，可保持schema/prompt及其余参数不变，不需手改HTTP body。

strict=false扩大的是上游提示/约束接受行为，不能替代或取消程序严格三branch、逐位置、canonical/source/retention/owner/版本/权限等门；本身无内生的程序接受安全阻塞，但可能增加非法输出、纠错次数或最终失败，须真实业务桥负控与实际观察，不能宣称Native等价可靠。现matcher硬验true，任何新诊断必须按固定可信case精确验证expectedStrict及其余wire，不能删除wire门。

`desktop/service/novel-import-structured-scene.ts:43–49` 的共用nativeSceneModel强true，不应全局修改。若另审条件产品，只能在原生场景清单已activate并冻结的bound repair生成阶段克隆选项；首轮、root-envelope、entity及其它scope/default必须不变，预算失败不得留下激活状态。该方向仍需新方案/用例、代码独审及实际false全门，尚非产品准入。

本审核仅本地安全标量、SDK/程序源与hash读取，无App/API、真实小说/模型文本/Key/开放HTTP正文读取，无源或测试修改。
