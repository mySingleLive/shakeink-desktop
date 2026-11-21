# 场景原生长文本事实复核用例独立审核

2026-10-31。审核者：独立子代理`structured_generation`。先完成308方案独审，再审核309；未参与本组用例编写或产品实现，未读取真实数据或调用provider。

**LF01—03设计通过，无阻塞，可以取得RED。** 用例分别证明原子资料保留、真实controller完整复核和原整包预算拒绝；无需重复既有全部SDK或RA矩阵。编写时落实以下证据边界。

- **LF01**：四个长值使用不同首尾哨兵及Unicode/CRLF，逐值比较每个证据batch得到的完整字段，不仅比较length或字段存在。投影必须来自原完整artifact；facts片不出现新factRange/textRange。短字段黄金应在产品改动前由原实现取得并冻结，覆盖多个text piece与多个evidence batch，避免只比较新函数的两次调用。白名单常量去重后原字段顺序、pieces/index和keys逐值相同。
- **LF02**：保持真实向导选择、场景生成和原native/来源门，通过原controller的review及请求组包到达facts复核；不注入coverage、checks或完成状态。RED须实证原guard对合法长字段拒绝，不能用setup、缺模型或无关预算错误充数。实际options.ai中的fact包逐项包含原完整长值及对应投影/证据，使用实际review冻结profile；完整reviewFacts等于原taskKeys，再通过正常wizard检查/发布mock。mock只能记录真实publish输入，不能称为原生落库/重开验收。
- **LF03**：坏夹具仍须通过原字段/native/本地总容量等前置门，最终确实由controller的完整单任务fits拒绝。若断言0次fact出站，应将首个超预算任务置于最小夹具的首dispatch之前；不能把这个局部零调用要求推广为“任意后续超大任务都应抹去此前已成功复核”。原成功body或既有成功fact credit应原样保留，未发出的字段无新credit，无publish。
- 范围表精确覆盖非白名单、同名其它kind、schema缺省/旧版，并用`field.length+value.length`恰等于piece及再多1的原边界作独立预期。旧scene不支持新字段的纯iterator反例仅证明例外未扩散，不能冒称其通过旧native合同。schema2白名单同长度可以枚举，但真正超完整请求预算仍须失败。
- 原权限/来源、reviewProjection、遗漏锁定、pending冲突及wave保存取消行为由相关已有组回归；本例外不能给予任何额外通过。保持仅定向测试，类型/构建及真实目标系统验收按总流程另行执行。

本审核批准测试设计，未执行新增用例或认证真实R23根因之外的其它问题。实施后需独立code review；合成GREEN仅是进入新构建全流程验证的条件，不替代全部场景、5589工作单元、完整facts与正常保存/重开的结果。
