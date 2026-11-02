# 正文边界与来源焦点用例

1. fresh新策略标记、旧策略校验/工厂/指纹/缓存隔离；旧cached units引用、边界、id和旧指纹不变，raw splitter/分类/排除/事实单元全原样。新几何仅fresh current policy选择，不以模型字符串开关，不静默升级旧ledger/作者决定。
2. 真实缺陷合成RED：3字场景名跨旧1000边界，旧hasSource true、单unit无法锚定；新句末优先后至少一个单unit能经原引用resolver与完整scene source门锚定。source text/id/start/end/rejoin及章节offset/content完全相同语义，不靠合成跨unit Anchor放宽。
3. 新分区最大1000、连续无重叠/缺口、全text slice一致；中文/英文强句末、长单行、多/单换行、CRLF原样、surrogate/emoji不拆、空/短/恰1000/无标点fallback、确定性ID及coalesce只合块；无标点不能伪称无fallback。新计数不硬编码为原型4912。
4. 新geometry进入审核指纹、fresh授权绑定；旧policy/cache不热迁移，legacy数据和旧checkpoint控制保留。真实文件离线核原文件/workingProse/hash/1402章exact、fallback统计及已证跨界称呼新锚点，不将此当全场景或供应商通过。
5. focus真实桥RED：错误context窗口与唯一正确窗口相邻但不同unit，仅数字提示仍失败，新增数据块含当前错窗与全部正确窗口的完整quote/编号；模型须显式改选后全原source/retention/owner门通过。新块不是自动修复，也不改变实际reply。mention焦点仅原resolver允许的全候选，不用空表宣称hasSource=false或允许0。
6. focus不截窗/不firstN/不创建新CF、不挪quote/owner；未知ref/歧义/patch内层压缩不能构造焦点。全候选超16384B或使原prompt-fixed/context超限就整块不发，全部原source/CF/keep/raw/current保持；schema/来源/模型限不变，预算未过不多一次SDK调用。
7. 同时验证source拒绝→完整focus→下一轮invalidJSON→再下一轮仍可见旧值绑定的只读背景；不冒当前诊断。可解析新候选清旧焦点、新错误更新、source通过清除，getter/未知形状先门不能复用为当前错误；原解析器和四代不变。
8. source/模型文字中的标签、JSON/XML边界和指令只作转义数据，原文不入静态错误/公开日志；反馈仍闭合≤6，不自动选窗口/删claim/whole0。原keyed/native/原array-repairs/source/retention/owner/编译/授权/版本业务正负控保持。
9. 原prompt/source/Native分桶及实际完整context上限不动，新完整焦点全部计费；旧几何130first及357历史生成原146/27控制不变，新fresh策略全部planner按真实新count覆盖/预算fit、body/章节原样。类型/桌面构建/定向测试及独立code review后冻结，正常fresh全书、总420000不重置、发布/重开全部真实验收；不执行全仓测试。
