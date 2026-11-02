# 336 片段与名称编码独立技术方案审核

结论：通过，无方案阻塞。审核版本 SHA-256：`d4adbebeccf5becd25ffbf1c8d1be9d9a7c603ff8808e168f6ccbc10c5e7342e`。

方案准确限定新 v1 scene roster 的 generation wire。发送副本用片段代替同一份 text，固定按原句/分句和换行边界切分，完整保留首尾、空白、Unicode 和 CRLF；原请求/工作单位不变。当前数组 unitIndex、当前 unit 片段半开区间和空 text 合同明确，不按旧 ID 缓存目录或猜跨包意图。

两种 anchor 与两种 record 都须严格互斥：先整份 wire shape 成功再编译副本；原坏 raw 不可借索引分支获救，混合键/own undefined/越界不能被丢弃。新 primaryMentionIndex 只选择本条已验证 mention.literal，按 exact literal 原顺序派生其余别名，所有 mentions 保留；超出原 20 个别名门仍拒绝，不能截断或规范化名称。该编码消除重复填写矛盾，不证明同一地点，原 ledger 身份审核仍负责语义。

索引恢复得到的原文 quote 仍必须通过原 canonical schema 与 validateSceneRosterRecords 的 quote/literal 双唯一、名称覆盖、每条 context、links 及总容量门。片段过粗而包含重复 literal 或 quote 时应拒绝；只有模型明确选择合法的更窄 raw 引文或另一次生成才可能通过，应用不得自动修复或再绑定。

所有片段及索引元数据使用原 serializeImportAiPayload，因此 controller fits 与 worker 实际预算看到同一完整材料；新增提示和纠错仍计入原预算/16KiB reserve。其它 scope 的 payload/prompt/wire/canonical、原 role/thinking/cap/两次上限不变。

当前 R29 单包探针不是 fresh 全文或历史 R28 raw 的重放，方案没有将其当作全书已解决。可进入 337 用例独审。审核者仅只读当前接口及文档，未修改产品/测试、读取真实小说或调用 App/API。

实施前澄清复核：版本 `2d51bfd7cec4fc36f100ad9df518fb1dfae6fa818d23306cd4d9804d1baf43c9` 仍通过。新 record 的 canonical 名称/别名错误映射回实际 wire 的 primaryMentionIndex/mentions，不能提示填写该分支不存在的字段；quote 不唯一可指导模型扩展连续片段，但 literal 恰一次门不能放松。新增 metadata 由最新 stageRequests 重建实际包，不把旧 94 units/旧 payload hash 强塞进新预算。均属原范围执行澄清，无协议或次数扩大。
