# 场景输出容量用例

日期：2026-10-31，依据276，先独审再RED。

- OC-01：真实MockLanguageModelV4经generateText/generateJSON捕获SDK参数，显式maxOutputTokens传入，无参数默认未新增上限；schema/用量/取消与既有行为不变。
- OC-02：真实Responses SDK+合成ModelService/ModelGateway出站，容量充足eligible scene应带max_output_tokens=32768、同modelID/endpoint、strict schema/reasoning none/store false仍保持。两次生成都带相同上限，非scope不增加。scope测试沿用SO真实出站，不只看传入意图。
- OC-03：按实际role计算容量；完整prompt/schema UTF8字节上界+既有wrapper预留+32768 <= role.contextWindow才增加。构造包含中文/非BMP、接近边界的大元数据及显式review pin，证明缺空间时不增加、单位/目录/选项逐值不变。不能用裁材料提高输出额度。
- OC-04：模拟合法大于旧8192输出额度的完整wire正文/事实，实际生产JSON桥/原canonical门完整恢复，不截断任何字段；finish仍length时保持两生成拒绝，不把partial parse通过视为成功，不增加外层请求上限。网络/授权/取消既有次数不变。
- OC-REAL：只读真实失败范围，记录实际SDK出站上限及结束原因/计数、配置不变及正常退出；再新会话全文默认全选场景完整流程。R16持续incomplete保留失败，不以局部成功、不同构建或旧R15时钟计最终通过。公开证据只有计数/hash/静态类别，不存原文、正文、Key或原始响应。
