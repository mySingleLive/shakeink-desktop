# 场景资料正文澄清用例独立审核

2026-11-01，独立审核者 `scene_hierarchy_review`。已先通过314方案独审，再审核315及已有SO/WG/OC相关测试边界。仅新增本文，未参与本轮测试/实现、运行App或调用API，未读取真实小说、私有响应、配置/Key。

**SPG01—05设计通过，无阻塞，可开始实际RED/GREEN。** 本组证明指导送达、输入与原接受门保持；真实模型是否遵循及长尾是否改善仍由后续接口和全新整书验证决定。

- **SPG01**通过真实generateImportAiJson/generateText/AI SDK到MockLanguageModelV4.doStream捕获schema与prompt，足以验证说明未停在helper。记录须准确称为SDK模型边界，不把mock当作实际DeepSeek HTTP请求或模型行为；实际API另验。指导须明确当前场景资料说明、所有不同有据事实及相关关系/历史/时间/归属完整，原小说由应用保存。
- **SPG02**保留原完整payload黄金及全部units/target/目录/8个引用选项。仅从schema副本精确剥离properties.text.description这一项再比较原结构及固定hash，不能清空其它注释或削弱required/pattern/enum/range/strict字段断言。WG03只适配这个允许差异；SPG01另断言新增说明确实存在。
- **SPG03**使用预定大于27529字符的text和四原生长字段，按原adapter/service末端门逐值及逐引用检查Unicode/CRLF完整保留，不接受裁字或少引用。该组是资料保真控制，不把合成stop/usage当实际供应商输出容量或语义真实性证明。可与SPG01组合，但RED提前失败后未执行的长值断言须如实记录。
- **SPG04**真实有限生成路径覆盖length→stop恢复及持续length拒绝；完整JSON即使可解析，length仍不能成为成功结果。原最多两次JSON生成、controller原请求次数与四gen等负例不因说明变宽；事实格式、知识归属、证据、授权与取消原组继续运行。
- **SPG05**新prompt与schema.description完整字节必须参加原payload/fixed-wrapper/实际role容量判断。原OC精确字节边界、role pin与默认/32768选择规则继续使用实际新增合同，不借更大text容量、不免除说明字节。非native能力路径、review及其它模型保持原通道，不能把本次文案接到所有请求。

RED应确实到达旧实现缺少业务说明的断言；既有长值/拒绝控制可能本来通过，不能为满足“全红”改造夹具或把未执行项记为失败。无新墙钟/RSS阈值；TDD不会证明真实复制、长尾原因或7分钟改善。

GREEN后仍须独立代码审核、受影响定向回归/类型/构建、当前原接口单项及全新默认全选场景/全部复核/正常保存重开。R25/R26未完成状态、固定7分钟门及旧证据保持；后续构建另冻身份，不能以指导到达或局部模型通过代替完整导入验收。
