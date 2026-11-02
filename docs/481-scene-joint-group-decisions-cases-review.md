# 481 测试用例独立审核

结论：480方案审核落盘后，按序审核481，通过限定TDD准入。只允许480指定的B bound/targeted及A AI渲染/软准备控制与必要定向测试；claim-patch、retention、source/proof等原接受门冻结。

十组用例覆盖了原multi-claim完整组合oracle、256/4096/65536边界、超限整组丢partial、singleton/超限组进入有序remainder，以及同slot完整不交叉分区。合并不能覆盖先答或遗漏claim，必须继续原patch.apply/source/owner/retention/remap；跨row同名与各组局部合法但全局冲突均有负控。

新Native主wrapper与旧策略golden分开；本地claimChoices兼容要求原序唯一完整option匹配，零/多匹配、混字段、数字猜解、数组/prototype/getter/Proxy均拒。列式rows和省domains任务要求独立手写inverse，检查字段存在性、0/false/空域、稀疏slot、完整CF和所有原数组顺序，不能用生产投影自证或strip未知字段。

准备测试包含编译一次与G+R单调界、整行terminal替换、旧版本失效，以及真实peek/render无副作用和原子bundle commit。必须分别证明：当前hard-fit但soft不足仍可用；preview硬失败/不节约/无候选即保留当前并停止；discard/stale/重commit不可用；原schema/text/Native/版本/计数及focus/retention没有预览污染。提交式私有原型不能代替这些TDD失败证据。

预算覆盖实际SDK完整资料可逆比对、原三桶N±1、激活后g3/g4冻结、完整可选focus及原usage/异常身份。两真实首稿的明确新回答须经原完整业务门成功；旧实际g2只作不可信失败负载测g3/g4。最终编码标志和guide后必须重新证明目标10/3完整options仍为selection及五个run+payload共20提示fit，不搬用原型字节数。不同run的相同202 payload按operation/首稿SHA分别追踪，368/719完整绑定和unused账不伪造实际成败。

负控应真实到达指定门，不能以先前预算失败假绿。最后仍须独立code review、类型/build/定向回归、正常全文/420000ms/无skipdrop、完整资料复核/发布/重开/离线DB深等。R73 snapshot修正须核本轮session/work/novel实际ID；原R72失败及未执行发布检查事实保留。不增加静态API探针或其它产品范围。本审核未改产品/测试，未App/API。
