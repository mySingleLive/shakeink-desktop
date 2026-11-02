# 已验证内联键格式与独立 schema 预算

R63、R64 两轮真实合成对照中，完整内联逐任务键编码均通过 HTTP200、stop、直接 JSON、Native、冻结原 tuple、原 decoder 和五任务见证；两种紧凑引用编码均失败（444、449）。本方案使用已经实际通过的内联结构，明确替换441/446尚未满足的引用编码前提，不再试探引用方言，不把旧失败改为成功。

独立零接口量测覆盖 R46/R47/R61/R62 共117请求、256实际生成，原本地结果92接受/25拒不变；其中131个active内联候选 schema 最大42369B，原来源cap失败0，原 prompt-fixed（不含schema、含原16384 wrapper预留）最高61181B，完整 prompt+schema+6000 的最小模型余量667112B。旧合并 envelope 拒绝57代、合并fixed拒绝12代。因此这里是**增加允许的组合控制开销**，不是重复计费修复，也不能声称预算完全不变。未来新指令尚未计入，最终仍须完整重测。

## 预算范围

来源 payload 的原 characters/maxUnits 与序列化上限不变；完整 prompt（不含schema）的原 fixed 65536B 上限与16384 wrapper预留不变。新增独立 Native schema 硬上限65536 UTF8 bytes，仅用于由应用可信已准备/已激活事务构造的当前逐任务键内联修复；预算仍在activate前检查，不得为了检查先采用失败草稿。完整实际 prompt+schema+原6000余量必须受模型完整context限制，容量未知仍按原16000 fallback，新路径不能因旧预算版本跳过完整context检查。

由此来源和控制开销都有限，schema不再同payload共用原混合envelope或同prompt共用fixed桶；组合可允许量提高，但完整模型容量始终按全部内容核算。普通导入、first/unparsed/root恢复、非Native/非scene/非当前修复、共享模型和其它调用沿原检查，不接受用户文本、schema根字符串或模型自报作为新预算资格。不能把新额度用于增加来源、裁资料、扩大输出代数或跳过授权。实现建议独立的专用预算函数，只在AI服务可信prepared/frozen keyed路径调用；原通用预算函数保持。

## 产品范围

只在 `desktop/core/novel-import-scene-roster-native.ts` 增加专用有限预算检查，在 `novel-import-scene-roster-bound-decisions.ts` 增加无ref的逐任务键内联schema及strict exactkeys反投，在 `novel-import-ai.ts` 接入。当前三种严格record、局部选择域/0资格、私有原decoder/编译限额、来源/保留/归属/关系/版本/作者/发布门不动。内联模板须与冻结真实成功A逐约束等价（仅任务数、原局部域、choice C、0资格按当前冻结表替换），不得缩水成可选metadata superset。

其余沿441/442已审产品设计：key1..N对象无序但精确完整，反投原decoder；旧array/repairs显式兼容；使用原Native strict=true默认，去除只为旧advisory可选字段设置的false覆盖；四代和其它模型/网络参数保持。闭合来源反馈只映射唯一replacement与直接对应内层；原hasSource已证缺源、同一原claimed、原canReject且当前boundCanReject才说明可显式0，仍由模型决定，不自动拒绝、删改或选窗口。

先真实业务桥RED，再实现；独立代码审核及根定向验证。原业务负控全部保留，Native/strict的旧显示测试只适配当前合同，不把新预算参数写入业务fixture来掩盖问题。Native专用边界、原scope隔离、16K实际context拒绝均须验证。最终重新计130首轮+256历史生成的新完整prompt/schema、来源/原promptfixed/独立schema/完整context，原本地92/25保持；新增指令不fit则先缩编码/指导，不增加这些新上限。

全部通过后冻结新构建，按原正常向导fresh全文，原420000ms总计时不重置。所有场景、完整来源/正文/资料审核、发布、正常关闭重开与完整DB比较未实测通过前，台账继续未完成。
