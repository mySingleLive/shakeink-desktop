# 场景资料正文澄清方案独立审核

2026-11-01，独立审核者 `scene_hierarchy_review`。只审核314及现有`desktop/service/novel-import-structured-scene.ts`的native prompt、服务器schema与wire适配；未改产品/测试、运行App或调用API，未读真实小说、配置/Key或私有响应。R25/R26运行数据来自方案/主代理，不是本审核独立重放结果。

**方案通过，无设计阻塞；可继续独立用例审核、TDD和后续真实验证。** 原native prompt的“text为完整非空白正文”确有业务指代歧义：适配代码把wire.text存为当前场景artifact.text，完整小说原文另在输入units及工作正文保留。将其明确为当前目标场景的完整资料说明，是有源码依据的窄范围澄清。

批准边界：

- 只修改现有native场景能力路径的固定prompt，以及服务器JSON schema中`properties.text.description`静态注释。移除这一项注释后，原type/pattern/required/enum/range/additionalProperties及所有结构须逐值相同；本地Zod、canonical/原生字段和所有末端validator不改。其它模型/路径/阶段的prompt和SDK默认行为保持。
- “避免其它人物/场景剧情逐段复写”应明确指与当前目标无关的重复内容。当前目标相关的全部不同有据事实，包括跨人物/地点的关系、历史、时序、信息归属及必要上下文，仍须完整保留；不能变成固定字数、仅留摘要、删除长说明或省略引用的要求。四个原生长字段及资料text继续允许原有合法长值、CRLF/空白和Unicode，不在适配层裁剪、归一化或搬字段。
- 原units/payload、目录、证据选项和完整资料不变。新增prompt与schema注释的实际字节仍由原生产预算完整计入，不能因为是说明文字就豁免guard、删来源或提高预算。原cap32768、模型/endpoint/thinking、并发、网络和两层有限纠错、finishReason门及7分钟验收门保持。
- 测试须通过真实SDK序列化出口证明说明到达wire，并比较去除唯一description后的原schema及完整payload；不能只断言本地常量或构造结果。长资料/原生长字段/Unicode完整适配、明确scope隔离与原预算边界须保留。TDD的RED应证明旧语义说明缺失，GREEN仅证明指导送达和合同不变，不能写成模型已经遵循或性能原因已修复。

接近输入字符数的输出、某次32768 token达到length以及第二生成stop通过，只支持继续调查，不能据此认定已复现小说原文逐段复写。314已正确承认没有历史流/原payloadHash，不能把新只读复测等同历史出站，也不把R25/R26少量长尾未完成记成全部通过。

后续依原顺序进行用例独审→实际RED/GREEN→独立代码审核→受影响定向回归/类型/构建→原配置真实单项接口及全新整书验收。真实效果由模型输出和完整全部场景、正文/事实复核、作者冲突门、正常保存/重开判断；静态文案改善不保证消除长尾，原7分钟门及完整成功要求不得调整。旧轮身份/结果保留，新构建须重新冻结，不借旧hash认领通过。
