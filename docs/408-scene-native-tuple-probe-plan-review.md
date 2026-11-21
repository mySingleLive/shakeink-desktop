# 408 独立方案审核

结论：通过，仅准入 PRIVATE 合成诊断 TDD；实际 App/API 须待 410 代码独审及主代理冻结后由主代理执行。

审核版本：`408-scene-native-tuple-probe-brief.md`，SHA256 `bd50e8ff84b7e2e05cfc49240265ad82bdb0416dbecb12eae1a6e9f1bc62877b`。

- A 直接调用当前生产工厂；B 仅替换同节点的 tuple items 为去重 anyOf 对象并删除 additionalItems，definitions、引用和其余字段深等。共同见证先经完整 Ajv 校验，能避免把不可满足 schema 当接口兼容问题。
- 每例一次、全局两次最终 fetch 硬限，重试为零，原授权链及正常退出保留。只含静态合成数据，不改产品、配置或使用额度。
- non-ok 的原 Response 立即返回；clone 读取按字节限 64KiB/1000ms，取消不等待。错误正文和开放字符串不保存，只投影闭合枚举及固定关键词布尔值，无需读取 Key 做脱敏。
- HTTP 失败记校验 not-run；未知、截断及关闭失败均保留失败状态。A/B 结果只能说明本次编码兼容差异，不能证明历史根因、供应商语义约束或全文验收。

实现时 clone 必须在原正文被消费/取消前同步取得，后续读取才后台执行；观测故障不得改变原返回值、异常或授权释放。这属于既定透传合同，无新增业务范围。本审核未运行 App/API 或读取真实小说/请求。

## Tee 取消边界追加复核

通过此窄合同修正：`Response.clone()` 会 tee 原正文。即使 fetch 包装立即返回原 Response、observer 不等待 clone.cancel，原 `ModelService.start` 的 `await response.body.cancel()` 仍可能等待 clone 分支结束。因此不能声称原取消零延迟；允许诊断读取期限内的有界额外等待（固定 1000ms，另有调度/原链自身开销），上限或超时触发 clone 取消以解除该等待。前文“取消不等待”仅指 observer 自身不 await 该 promise，不表示原链无等待。

准入要求补真实 Response + 原 ModelService/Gateway 的 fake400 控制：慢读、悬挂 read、超 64KiB 时，clone 限时/限量取消后原取消、释放及 broker close/drain 均有限完成，Response 身份及立即返回保持。单独 fake clone 对象或不 await cancel 的断言不足以证明此点。底层源取消自行永不 settle 的既有故障不能被表述为 observer 已修复；相关失败仍须保留，不能清理后报成功。此追加只约束 PRIVATE 观测，未改产品或执行 App/API；实际准入仍等 410 核实新增控制。
