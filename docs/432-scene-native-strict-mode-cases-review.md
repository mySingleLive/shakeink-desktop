# 432 独立用例审核

结论：431 通过后，432 按序通过。SM01–03 可 PRIVATE TDD；SM04–06 严格保留 false 实际前提，当前不得提前动产品。

审核版本：`432-scene-native-strict-mode-cases.md`，SHA256 `b5e523eec4d724592ac90e34309506bee3412548ceffa3b9801a160f80028be8`。

SM01–03 约束原 schema/prompt/witness 与各 case 唯一 strict 变化，并通过真实 SDK→Gateway→假最终出口断实际 wire。反向/缺失/字符串 strict、schema/input 错配及额外 fetch 均有 fail-closed 反控；剥 strict 后 body 深等、原 resolved/record 不变与并发隔离能约束无全局设置副作用。原安全投影、真实 tee、只读/WIP/hash/关闭门复用，没有另造观测机制。

SM04 的核心是先证明 activate 状态，而非固定把“第2代”当修复：若第二或第三代仍 root/unparsed 重新识别，其 strict 继续 true；只有已冻结 bound 的实际调用 false。首轮、无 active、entity/generic 及原默认单独正控须保留，传输/授权/取消/非 stop 不因开关获得新重试。

SM05 以 Native 通过而真实业务桥仍拒 partial/mixed/错位置为有意义负控，unknown 两门独立拒；三合法编码和完整 source/retention/owner/版本门保持。SM06 必须实际计完整 schema/prompt 与全部材料，原三 envelope 失败、CI16K/边界及130+136全覆盖，不抬容量或删包，历史重算不冒供应商新结果。

实际两次由主代理在 433 后执行，false 不满足条件则停止；新产品仍需独立审核与 fresh 全文/发布/重开验证。本审核未运行 App/API、未读真实资料/Key。
