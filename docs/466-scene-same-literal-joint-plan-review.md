# 466 · 同称呼联合选项技术方案独立审核

结论：通过，无阻塞；须待 467 用例独审通过后才产品 TDD。方案 SHA256 `ba980378236d935de3555f70555170f91d6b666998ba65c0cc0b6ba49a3ef83d`。当前 57 个产品源仍与 R68 冻结一致，本审核无 App/API 或产品修改。

现有 `select` 的新 member 去重在一次调用内生效，memberKey 含 exact literal。故仅在同一行内按精确 literal 联合原 mention claims、让原 select 验证完整组合，能够提前排除已证的局部合法/联合重复；不同 literal 不为此合并。Map 首次出现顺序、组内原 claim 顺序、context/link 原序必须保留，不改 claim 域、位置、reject 权或基底。最终跨组及 owner/source/retention 门继续执行，联合局部选项不是全局成功保证。

完整原窗口域的笛卡尔积仍由原编译器枚举并过滤；同一发生位置的多个 CF 窗口不能当作不同 member，也不能选代表窗口、去重或裁域。256/4096/65536 原阈值不变，不能取得完整组时须整行原 replacement，不能保前 N 项或拆回独立组。该边界已明确，组合容量风险有可执行的失败路径。

已核私有 v2 安全证据及构建变换范围：只在内存替换 mention 分组，走原 runImportAi/SDK 合成链；首输入/首稿相同，新 32 个 selection 的明确反事实答案接受 20 records，2 次 Mock SDK，Native 1853B、fixed 52640B、context 346474B。关键两 claim 在新同一任务的 8 个完整方案中选取不同 member；旧独立任务同指一个 member 的拒绝被保留。0 API、旧 39 个数字不复用；单例可行性不代替正式全预算或 R69 供应商/全文验收。

260 请求/519 捕获的历史核验沿用完整最终 binding 与旧实际输入前缀证明，changed/unknown 在 prepared 请求后、SDK 前停止，逐捕获互斥归账，不据旧数字判新语义。正式实现后仍须完整首轮/首稿准备预算、2/3/4 代控制、独立代码审核及 R69 原计时正常全流程；R68 actualFailed 保持。
