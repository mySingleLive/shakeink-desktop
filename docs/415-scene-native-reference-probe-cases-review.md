# 415 独立用例审核

结论：414 通过后，415 按序通过，可执行新增 PRIVATE TDD；不认证尚未执行的实际接口结果。

审核版本：`415-scene-native-reference-probe-cases.md`，SHA256 `6b95b4a9009216cef8ccb72fcd8b233af9962028e94e83da36e320a93da3a84b`。

RP01–RP04 覆盖实际工厂/冻结源、完整原字段与限制、共同见证及错数量/位置/类型/边界等原新接受一致、非法引用与工作上限零 fetch、真实 SDK 出站展开 schema、逐例/全局调用硬门及原流/安全存储复用。没有用私造近似 schema 或 mock options 替代真实最终出口。

JSON Pointer 正控需精确查 root own 字段；`~0/~1` 解码只解析 token，不允许通过字符串替换猜路径。循环检测应按当前展开路径，合法共享定义可被多处使用；输入不可被修改或冻结。根 definitions/$defs 删除后的树须完整无引用，失败不能发网。

原 R50 真实 tee 收尾控制及 frozen source/CJS hash 仍须核实，不因新 wrapper 改名重新实现流。HTTP 失败仍 not-run，底层退出失败不能被 cleanup0 掩盖。实际 R52 最多两次，由主代理在 416 后执行；本审核未运行 App/API、未读取真实数据或 Key。
