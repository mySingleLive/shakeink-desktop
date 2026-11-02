# 场景七分钟定向用例

日期：2026-10-31，对应253。

- SP-01 模型：仅scene entity获得既有提取轻量策略；原resolved model与provider配置不被修改，store:false/其它options保留；普通scene analyze、review/reconcile、item/world保持原对象，character/roster既有策略不回归。
- SP-02 目录：30+合成地点，有跨材料别名和三级父级。每个请求完整可信目录仍含全部已选ID；自由instruction恰好相关名称/别名与父级闭包，确有无关项被省略；源units/文本范围与证据选项保留，全部资料字段、父级、ID和证据最终逐值相等。不能仅因同名或别名重新合并已选ID。
- SP-03 范围：真实64场景controller路径只完整计算一次相同授权scope，每个请求payload hash独立；unverified与普通分析不走缓存。沿用并复验所有缓存生命周期失效、错误grant零AI调用及暂停恢复门，scene负例同样验证。
- SP-04 既有安全：31实际pending/runtime/proof、取消排空、慢写合批、写失败停止、字段/anchor纠错上限、原生schema2/证据/父级/发布定向回归。测试数以实际运行结果记录。
- SP-05（R8）：仅scene entity补全缺省的已确认PLACE与parentId，四资料字段/text/引用逐值不变；显式错PLACE、错父级（包括目录中存在的另一PLACE）、额外父级、未知字段仍拒绝，普通scene分析不补全。真实controller→生成桥对invalid_json/incomplete前两轮失败第三轮有效可恢复，持续非法精确2请求/4生成失败；其它错误不重试。原SI08的“漏已确认parent即失败”预期由本有界控制元数据协议覆盖，显式错parent仍失败。
- SP-REAL 指定原件、真实已有DeepSeek与macOS Electron，新session全1402章和全选场景；从开始场景识别至所有场景完成≤420000ms（单调时钟），并记录entity阶段耗时。超时不能成功退出；完整ID/覆盖/零跳过/正文hash检查后发布、正常退出、重开逐项核对数据库场景、四业务字段、父级及全部卷章正文。真实识别数量取本轮模型结果，不硬编码固定数量。

基线R7不通过的原结论保留；不拿局部吞吐推导整批成功，不把合成模型/受控选择器当真实供应商/原生文件对话框。
