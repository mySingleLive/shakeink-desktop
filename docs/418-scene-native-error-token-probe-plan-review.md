# 418 独立方案审核

结论：通过，仅准入新增 PRIVATE 合成 TDD；实际两次请求仍须待 420 独审及主代理冻结。R50/R52 结果不满足 412，禁止据本方案开展产品 TDD。

审核版本：`418-scene-native-error-token-probe-brief.md`，SHA256 `bf58301bae6ebe6263a56c065f1b8be1e977c3078b9dbf29dd7c2add71dcaebe`。

范围符合最小诊断：逐字复用 R48 已知正控与 R52 B′，明确二者不同 prompt/schema，不冒充单变量实验；各一次/全局两次最终 fetch、无重试，原只读授权与正常退出保持。旧产物不改，不发送小说。

原因投影只从完整且成功解析的固定 own message 路径提取，原文不保存；先移除 URL/授权段，再按完整 ASCII 词元精确映射固定词表，未知 other、连续合并、128 项硬限，避免未知字段/值或子串进入结果。词序可保留“must/not/unsupported”等有限原因线索，但仍只是有损证据；未知或截断不能当原因已经确定。

复制流代码只能替换 pure projector；原 Response 身份、立即返回、tee 有界等待和 cancel/drain 不得另改。420 应以逆向字节恢复/精确 diff 加原真实链控制证明这一点。无需读取 Key 做脱敏，因为没有开放错误串落盘。

可判读性建议（非阻塞）：固定 `true/false/json/json_schema` 如需加入，必须先静态纳入词表和测试，不能根据实际供应商文本动态扩词。保留现词表也可实施，但须接受对应原因可能投影成 other。原保护门失败、正控现在失败均照实记，不补第三次。

本审核未运行 App/API，未读真实小说、Key、历史原始错误正文。

## 最终静态词表窄补审

通过主代理批准的固定追加词集合。418 当前 SHA256 为 `389a92d6d52ced4abac7a307af5091c071978d41a981b1892d9b049b77f6529c`；419 保持原版本。以原词表加文档明确追加项、按首次顺序去重，实际为 **161** 个规范词，与 PRIVATE `scene-native-error-token-probes.ts` 的 `REASON_WORDS` 逐项同序相等，大小写折叠后无冲突。词表紧凑 JSON 数组 SHA256：`3dbf70687442994beab17da86ba6aefe7ef979711ae4797fe14f043b30b6be44`；核对时该 PRIVATE 源 SHA256：`bc9fec17e38b4f134afefa8365a3f03c1f514a1f8ba1fcb0601bb404784fc9f0`。

仅增加预先声明的标准 schema/普通错误词，包括 true/false/json/json_schema，不从运行时响应学习。原完整词元精确查固定 Map、未知 other、连续 other 合并、128 项上限及截断标记、先剔除 URL/Authorization/Bearer 段均未变；无开放串、数字、Key 或任意字段值出口。可判读性增强不等于真实原因保证。

此结论只冻结该词表/投影范围；完整实现、产物及真实控制仍由 420 审核，非产品 TDD 或实际 API 准入。本次仅静态读取纯通用源并比对集合，未执行 App/API。

最终完整段边界澄清通过：当前 418 SHA256 `de7aee1de30654c7eb61c57ee31026a93a20ccc3ef2552bb3499bd37b159b567`，419 SHA256 `3c74a222b85f35cda53300b74268aa6a5e99dae1b74ce57128b708433c01c60e`；核对时 PRIVATE 源 SHA256 `5f489fc526ce6cf2e71144492cc4b1026e8955d57be013c2941bf7b046f7bc58`。Unicode L/N/M 与 `_ $ . / -` 扫描为完整段，纯数字/点斜线连字符段省略，其余未知整段仅 other，堵住 `123schema`、中文前后缀、路径及连字符组合的子串拾取。此保守修正符合原完整词意图；161 词及集合 SHA `3dbf70687442994beab17da86ba6aefe7ef979711ae4797fe14f043b30b6be44` 不变，URL/授权预剔除及 128 限制不变。本文早先 ASCII 描述由本最终边界记录取代；不新增机制或产品/API 准入。
