# 场景修复的单项候选与定点反馈

R46 同轮正常捕获及忠实离线回放已定位：6 个修复事务末代首拒分别为 3 个旧 mention occurrence 冒用（2 本 owner、1 其它 owner；均非 newMembers）、1 个固定 label/引用窗口错配、1 个同 owner 已证 context 冒用、1 个 replace mention 引用未满足 literal 恰一次。每代实际 inputTextSHA 均匹配，0 API、产品未变；另 1 个原文限定包由 root 对照。原门拒绝正确，不放宽、修正或替模型选择这些结果。

本增量只改善修复材料展示和安全纠错反馈：claim-patch/targeted-repair/ai 及必要同类纯 helper、新定向测试/预算测试。首轮、原 replace/reject/patch 接受语义、CF 私 Map/公式、全部来源/choices/keep、四代、Native schema、角色/用量/授权/取消及全部原 whole/source/retention/owner 门不变。根恢复不变，不自动选择或 reject，不加请求、不改正文。

完整目录构建完（含所有行、完整保留窗口和 whole-unit）后，给已声明 patch claim 增加 `eligibleChoiceRefs` 展示。只能从原完整 CF 目录派生：mention 过原 source/literal 恰一次门且不是任一 old occurrence；context 过原 source/固定 label 门且不是受保护旧 context；排除与该原分组固定基底必然重复的窗口。link 仅作原 source/固定基底的单项可判定过滤，双端/完整关系组合仍原门处理。不删除或替代全局目录，不改 CF，不扩大来源。列表仅是静态单项候选，不承诺联合合法；newMembers、跨 claim/行重复、完整证据组合、owner 桥接等原事务校验全部保留。空列表不自动 reject、也不改 canReject 或资格。返回独立冻结副本，不把模型字段当 predicate 或授权。

原 replace 行继续现有完整语法，指导已有 literal 先对照该行 candidates 的精确 source 选项、已证窗口对照 keep；有据的新 literal 仍按原 CF/来源门，不能把展示表变成额外接受白名单。patch 指导只选该 claim 当前展示候选、保留既有基底；不要求重新抄 label/literal，不把全局任意 CF 视为适用于每个 claim。

实际原 guard 拒绝时可附定点诊断：只使用本事务**应用已声明且已确认的 repairRef/claimRef**（replace 只给已声明 repairRef 和固定字段/数字下标），加闭合静态 reason：literal-window-missing/literal-window-repeated/old-mention/new-mention-duplicate/context-window-missing/old-context/group-window-duplicate/transaction。须由可信 helper 内部产生或私有错误关联验证，不能从任意 Error/model 字段反射；未知 ref/key/value 不回显，仅原通用反馈。每条按 UTF16 截至 250，总条数仍原上限；保持原 error kind/结束原因/次数和静态业务标签，原通用修复事务反馈保留。联合冲突如实指当前已声明 claim 和固定 reason，不按遍历顺序自动分配 CF 或改其它 claim。

展示与反馈新增的**全部实际字节**继续原 fixed reserve、schema、完整 payload 和实际 role/context 容量门，不裁来源/草稿/当前回复/目录/keep。先 397 独审、业务 RED→GREEN、398 独审，再定向组合/类型。必须复核原 CI 16K 容量临界及新候选/反馈实际二至四 prompt N/N-1；并用 R46 完整 130 planner 和 77 同轮捕获输出做 0 API 的新 prompt 预算上界回放。新增 prompt 与旧 actual 捕获不再逐字相同，应明确区分预算回放和供应商行为，不能据此声称实际新结果通过。随后由 root 执行 fresh 全文；全部资料复核/正常处置/发布/重开仍待实际验收。
