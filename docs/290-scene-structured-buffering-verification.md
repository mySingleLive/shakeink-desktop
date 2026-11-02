# 场景结构化流内存修复与全文续验

2026-10-31。完整导入发布/重开尚未通过；R19/R20的worker OOM保持失败记录，见285及脱敏R20采样。此处不将局部场景进度或合成测试升级为整书成功。

依据287/288及独审，仅在显式jsonOutputSchema的既有Output.object上覆盖parsePartialOutput返回undefined，保留五个原SDK字段中的其它四项（含服务器responseFormat、最终parser和element transform）。SDK在text-end/finish-step仍完整刷新text；generateJSON原完整JSON/Zod/canonical及全部业务、证据、授权门保持。无服务器格式/网络流模式/模型/输出额度/次数/用量/取消变更；普通文本不变，不增堆上限或降并发。

真实SDK RED14项中11通过3失败（含SB01父项汇总），两种结束方式各1716次不完整前缀解析；所有输出/格式/用量及失败门在旧路径已先通过。最小实现后GREEN14/14，未完成前缀解析均0，完整文本和原有限失败条件保持。受影响最终组**311/311通过，0失败/跳过**，包含新14及真实用量7，不重复计数。无增量TypeScript和桌面构建通过；只有既有MODULE_TYPELESS_PACKAGE_JSON提示，未运行全仓测试。

冻结14项正常产品源/产物身份为scene-import-verification/build-identity-r21.json。独立代码审核与普通产品全文验收随后补记；实际轮次仍须所有默认场景、完整后置复核、发布、正常退出及重启逐字段/逐章和完整材料快照一致。数值内存观察只读、不改变通过门，不以R20提前停下的诊断代替。

289独立code review已通过，无阻塞；审核者独跑新14与既有structured25共39/39，实际Responses网关strict schema/reasoning/store/cap均保持，非正式全文成绩。主代理311/311及类型/构建已完成，待数字-only观察增量独审和新R21完整实际流程。

291独立数字-only观测审查无阻塞，作者及审核者均独立证明移除计数hook/absoluteimports后driver与正式脚本逐字节相等；全部原验收/保存/退出门保留。native bootstrap实际四个worker heap数有效、GET200、pending/writeFailures/timeouts均0、正常退出。见scene-import-verification/r21-observation-identity.json。R21普通产品已启动完整全文验收，只读数字观察，不是R20提前停止的诊断，结果待实际完成。

R21真实结果尚未通过：1164候选中658完成后1项持续场景字段格式拒绝，driver2/app正常exit0，无OOM；47次数字观察worker峰553144812bytes、末次246298572bytes，模型配置hash不变。内存改善有实际证据，但不能称完整导入通过。失败检查点已保留，继续按原范围诊断具体字段，不跳过或弱化最终门。见[r21-partial](scene-import-verification/r21-partial.json)。
