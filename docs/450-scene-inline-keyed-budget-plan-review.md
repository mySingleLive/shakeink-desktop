# 450 独立方案审核

结论：通过，可在451按序独审通过后开始TDD。本方案明确替代未通过的引用编码前提，使用已两次实际通过的完整内联A；不再由引用假说继续试探或把旧失败改记成功。

审核版本SHA256：`03a87a8806b3aa3dec1dc39e6016a722d73151426cf35e6f3761545490e0e96b`。

独立0API量测已完成全部117请求/256代，92接受/25拒保持；131 active inline候选最大42369B，source原cap全部过；prompt-fixed不含schema且含16384wrapper最高61181B；完整prompt+schema+6000最小context余667112B。原耦合envelope与fixed分别会拒57和12代。故独立schema65536桶**确实提高组合控制允许量**，不是原预算不变或重复计费修复；该有限工程参数有当前数据依据，仍须测最终新指令和130首轮，不能宣称任意未来任务都fit。

范围控制充分：只在AI服务由可信prepared/frozen keyed事务构造的Native修复调用专用检查，activate前同时过来源原characters/maxUnits/序列化限、原prompt-fixed65536（含原wrapper）、schema实际JSON序列UTF8硬65536及完整context+6000。必须使用本次实际resolved role的pinned容量；未知按16000，v1/v2均不得豁免完整context。失败不能activate、出站或部分采用。资格不来自模型文本、root键名或任意schema。

通用预算及first/unparsed/root/非Native/其它业务保持，输出代数/模型/网络/授权和420000ms正常验收钟不增不重置。新增三处源范围有清晰职责：纯专用有限预算、完整内联逐位置schema/严格键反投、服务接线；原严格三record、原decoder/工作限额/source/retention/owner/0资格/关系/版本/作者门保持。旧array/repairs显式兼容及原strict=true默认恢复，不污染共享选项。

来源反馈沿441已闭合的唯一replacement/直接内层及保守hasSource资格，无法可靠定位则固定指导；不自动删除、补字段、选窗口或reject。最终130+256全部材料/新schema/新指令按新明确四桶核算，92/25仅本地回放基准，不冒旧SHA或新供应商行为。代码独审/构建/fresh全书、完整资料、发布和重开仍必需。本审核未改产品/测试、未调用App或模型。
