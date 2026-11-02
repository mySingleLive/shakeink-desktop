# 场景原生结构化输出用例

日期：2026-10-31，依据268与独立审核，先RED。

- **SO-01 可选输出参数**：真实AI SDK的MockLanguageModelV4经generateText/generateJSON入口捕获doStream参数，显式jsonOutputSchema必须转为JSON responseFormat及同一schema；无参数时不添加输出模式。配额、用量、取消、finishReason与原两生成纠错保留，不能只断言调用方options里有schema。
- **SO-02 wire与canonical**：固定唯一目标、确认父级、全部8业务字符串（含空串）、正确typed索引及primary和所有additional引文逐值恢复，sourceUnitIds仍由原索引协议派生。完整catalog须同时覆盖entities及合法context artifacts；只按完整不可变类型目录编号，可见payload副本referenceIndex与恢复逐项一致，原请求/units/全部引文选项不变。大量场景时schema大小不随ID列表爆炸，不用巨大enum。
- **SO-03 严格反例**：wire额外id/name/kind/origin/parentId/entityType控制键、facts未知键（含undefined）、非法非record容器、缺业务字段、null/数字、空白text、非法reliability/无归属、references负数越界/非整数/错类型、primary/additional越界或混合形式，均整项拒绝；不删除坏字段、不覆盖控制值、不丢坏引用取第一项。普通canonical空引用等原非法值不因新wire被接受。
- **SO-04 SDK/授权出站**：使用真实OpenAI Responses SDK和合成ModelService/ModelGateway传输，捕获body必须json_schema strict、reasoning.effort=none（forceReasoning有效）、store=false、相同modelID及原origin/前缀；placeholder由主网关注入合成Key，实际Key不进入worker参数。modelRecord/provider保存配置和原options对象不变。错误stage、无选项、其它provider/model/endpoint不启用；不降级、不新增重试。
- **SO-05 集成与预算**：controller→runImportAi→generateImportAiJson专用wire恢复为原canonical后仍过全部原生/身份/父级/typed引用/Unicode/证据/最终授权门。schema和新增索引payload计入既有预算；超限零模型调用，units和选项不裁剪。持续非法保持2请求/4生成上限，网络/授权/取消不新增外层恢复。
- **SO-REAL**：代码独审/定向组/类型/构建后，先用完整wire纯合成实际DeepSeek探针验证全部schema关键字、真实SDK思考关闭、同模型/端点及正常退出；再只读复测原失败目标。只有新session原件1402章/5589等全部单元、默认全部本轮场景全选，最终全部任务/候选/资料ID、确认父级、零失败跳过丢弃警告、源/正文/章界切片不变，正常保存退出并重开逐字段逐章比较，才计整书成功。探针/局部复测不代替全部导入，不运行全仓测试。
