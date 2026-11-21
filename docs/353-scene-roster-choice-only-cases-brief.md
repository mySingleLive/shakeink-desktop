# 修正轮choiceRef用例

依据352，按序独审后TDD。全部合成真实生成桥，0provider；实际模型另验。

- CO01：首答坏slot，次答将每个已保留及修复Anchor用本目录cf完整替换；整份canonical与指定原完整窗口/owner/context/link一致，good rows固定，原draft不变。
- CO02：相同来源和窗口分别用raw/ef/halfopen替代次答cf，及cf混键/未知cf，均第二代严格拒绝；即便旧引用本身合法也不fallback。相同旧三编码在首答generation wire仍按原义通过；公共canonical仍只接原raw Anchor，ef/halfopen须先精确编译为raw，不直接进入canonical。
- CO03：cf为正确unit中错误literal或同literal不同旧保留窗口，仍source/retention拒绝；context/link须显式cf whole-unit或保留窗口，不隐式扩窗。
- CO04：实际完整第二prompt包含完整prior、所有choices及新示例，原fixed/wrapper/v1边界、取消/网络及两代上限继续通过。旧fixture适配须精确Anchor匹配cf，无选首项或伪造模型服从；原373相关回归及类型检查执行。

记录真实入口RED和有意协议改变，不把未达断言或Mock算实际供应商通过。产品增量审核后才启动R35。
