# 404 独立方案审核

最终结论：主体与 good-row 入链窄增量通过，可进入 405 用例独审。此次增量方案 SHA256：`0222263e2d8191c88effc0a31b1820615fd5c816538f86243eee972285ed312a`。

最新 provider-view tuple 增量已先审通过，方案 SHA256：`02d3bd3dd034846c17cae924d078908c68eff36d44aebc8f8f2eab6275a93e1c`。仅共享 choices 显示换为固定八列 `[原序1-based号,原CF,unitIndex,start,end,sourceRef或null,flags,literals]`，不得丢项/改序/缩窗/去重。已独立核原 entries/compactEntries 的 wholeUnit/preserved 只输出 true 或缺省，故 bits 1/2、flags 0..3 关闭恢复缺省可逐值无损；不是吞掉 explicit false。null 仅表示原 sourceRef 缺省。

私有对象 API、CF/哈希、resolve 和接纳模型输出的入口均不改。严格 reader 只对表示作八列/连续号/字段与位域检查后展开，旧 object 分支保持原义；不能忽略未知 flag、错列或重排以修好夹具。图例与全部 tuple 仍实际计原预算，root 须重测完整 130 first 与 136 历史回复的新提示，不把约 7KB 局部字节节省冒充 be8 预算已关闭。

已读 403、当前 targeted-repair/apply 与服务 repairRecord。目标与完整导入/来源保留约束充分，不需再次询问用户。可改变的是模型重复输出的控制标识与模式；来源、语义选择、完整窗口、owner 和实际验收门不可移交给默认值或宽松解析。R48 反例不能泛化成所有供应商均不支持，但足以拒绝把 strict/schema 当作控制正确性保证。

最初需关闭的实际源边界已补齐：WireRow 的 TS 三数组类型不等同接受合同；原 repairRecord 另含 name/aliases 完整支与 primary 支。新 bound replacement 保留三支逐字段映射、多证据和新语义文字，旧 repairs 仍按独立 strict 根显式兼容；不投影、洗白 mixed/unknown/own undefined 或按失败结果换支。

任务已冻结准确顺序和数字语义：canReject 行只有一个 replacement 任务、显式 0 才编译整行 reject；其余按 slot/原 mention/context/link 位置绑定，claim/group 的 reject 也是编号至少 1 的明确选项。漏答、多答、错误类型或越界不能默认选首/补 reject。任何组不能完整编译时整行回 replacement，不留下部分任务。

context/link 小组完整 assignment 包含原多 CF 选择及每原位置的显式决定。每组 256 方案、每行 4096/每请求 65536 步保护在 partial/子集/组合扩展与校验前计数，含非法分支；未证明完整就整行 fallback，不截取前 N、不假称原资料已超模型预算。组局部 predicate 从原 apply 等价提取共用，不填其它 claim 默认答案；跨 claim/newMembers、跨行/owner、关系及最终完整门继续执行。

最后增量将示例明确为“完整的该组局部候选”。主代理零 API 局部替换后仍被其它事务门拒绝，不能据消除组重复声称全事务可行；此澄清与原独立全局门一致，已复核，不新增实施范围。

good-row 入链增量已对照当前 targeted-repair 的原 remap：good row 原样保留，精确原 target slot 被 reject 后其 indexMap 必不存在，原 TR52 必拒。因此仅对这个静态必败操作设置 boundCanReject=false、固定 good-row-incoming-link 原因是安全的；原 canReject 事实不改，完整 replacement 留在新任务，旧 repairs 的 reject 仍原门拒绝。不得扩大为来自可改坏行、局部 proof、同名或其它 slot 的限制，不自动保留坏内容、删 link 或补 target。

实际提示应以 answers 为清楚的首选合同，不能附加与其冲突的活动旧指令；旧根兼容是明确严格分支。新完整表/方案/schema 与所有原材料仍计原二至四代预算，原 CI16K、N/N-1 和同轮离线新提示上界需要重新验证，不冒旧输入哈希或供应商新行为。

405 必须包含不可 patch 的真实 replacement 退路、旧三支/负控兼容、显式 reject 与 good-row 限制正反控、完整多 CF/分组互斥、编译保护全退路、predicate 提取等价及无默认选择，再进入 TDD/406 独审。预算验证另保留 R46 全 77 次（含 be8 大包既有 fixed 回退）及 R47 全 59 次历史新提示测量、130 first 一次；不只覆盖较小 R47。当前只是方案通过，未改产品/测试、未运行 App/API，不代表全书复核/发布/重开已通过。
