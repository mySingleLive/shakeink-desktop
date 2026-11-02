# 353 独立用例审核

352已先通过。通过，无阻塞，可立即TDD。审核 SHA-256：`7aea700981090d60b608ca6cefc5ffb9a6f7dacda3576bc63183db563457bac4`。

CO01—04覆盖全份精确窗口/归属保留、第二代旧合法编码也拒绝、错误 cf/窗口不绕原门、真实完整 prompt 预算和原次数。fixture匹配须为相同 unit+完整 quote，不能以首 choice/缩窗获得假绿；不支持的任意新窗口明确失败。

CO02执行澄清：首答保持 raw/ef/halfopen，公共 canonical 自身仍仅接受原 raw Anchor；ef/halfopen须先编译成 raw 再验证，不能据“按原义通过”放宽公共 schema。这与352“原接受集合不变”一致。

记录实际RED/未达与有意协议变化，独立代码审核后才实际R35。本审核无产品/测试修改、真实资料或 App/API 操作。

当前修订 `5bc03a9a6dae8d3a959cd5995496ccef5622b379c36993bf31759ff10a3a649b` 已直接写明 CO02 canonical raw-only，文意歧义关闭，维持通过。
