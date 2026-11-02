# R64 官方引用示例编码实际观察

两次合成请求中，原内联 A 再次 HTTP200/stop/直接完整JSON，Native、冻结原tuple、原production decoder及五任务见证均通过；单数`$def`/纯ref C 返回HTTP400、无模型输出，schema校验not-run。446产品条件不成立，未改产品，不补试。

A 18946B、C 2931B，实际同prompt/见证/strict=true及其它参数，wire完整精确匹配。C闭合投影为`invalid json schema field anyOf missing field type other`。只证明本次给定C编码在当前Responses接口被拒，未检验其它ref位置或所有引用形式，不能推广为全局引用能力结论。[官方工具调用示例](https://api-docs.deepseek.com/guides/tool_calls/)未替代这次实证。

每例一次fetch，合计2，无retry，无小说输入；App正常退出0/signalnull、runner0、quitTimedOut=false、pageerrors0、只读usage、metadata writes0。368源/构建/renderer保护、108依赖、当前及旧R63冻结文件、隔离配置及runtime均保持。公开[安全标量记录](scene-import-verification/r64-keyed-official-ref-observation.json)与私有完整绑定分离保存。

目前只有内联编码已在R63/R64两轮真实对照中通过全部合成门。接下来可独立评估在保持来源和完整模型容量限制的前提下，为Native schema明确核算有限的控制开销；这若改变原组合预算允许量，必须另行审查并如实记录，不能称预算完全不变。尚未实施此替代方案；完整场景导入、发布及重开仍未通过。
