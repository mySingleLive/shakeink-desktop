# 接续用户已有来源草稿的首次AI前观察绑定

日期：2026-10-26。待独立技术/用例审核；不改应用功能。用户明确选择由代理继续当前S02草稿。

当前真实来源草稿为`4aea2d40-2fb9-4506-85aa-4d409b3e7399`，createdAt为09:45:39.765Z、revision4、phase source。只读核对：唯一完整S02 MD，原SHA1448…fd7d，6294字符/105单位；无coverage、artifact、决定、grant、runtime记录或正文工作版本。独立全书oracle已在更早建立，正文预期仍5310字符/1df1…697。尚未发送AI。

原observer只追踪freeze之后创建的journal，不能假装这个已有会话是新建，也不能修改旧B2记录、排除列表或journal来让它匹配。新增明确的source-only接续模式，保持其余样本默认路径原样。

## 范围

仅`scripts/observe-real-novel-import.py`和新增隔离`scripts/verify-real-novel-source-adoption.py`。不改main/service/UI/模型/原件/oracle，不操作应用，不改真实journal。实际冻结由root在审核后执行。

- freeze新增可选`--adopt-source-session <canonical UUID>`；未给参数时原行为/字段不变。保持真实existingJournalIds完整列表（包含所接续ID），另显式记录adoptedExistingSession身份、原createdAt/revision、绑定时journal hash及“首次AI前source接续”的模式。
- 只读取指定UUID目录的regular session.json/.owner，使用现有无链接/无别名安全读取，目录UUID=journal.id且owner标记匹配。所有源文件路径/hash/纳入状态必须与frozen_input确定的完整源集合精确一致；来源/独立oracle仍走原完整hash验证。
- 必须semanticVersion1、phase source、workingRevision0、原/工作正文空；artifacts、decisions、publication、非空coverage、classification/analysis grant、semanticState、任何runtime调用/证明均不存在。拒绝不明/已开始分析草稿；不以“当前没有在途”冒充从未AI。候选journal读取容量64MiB：读取前stat预限，最多读取limit+1再核对身份/大小；不先无界read再检查。对本次源草稿足够，但不改变普通observer或新建样本容量。
- 在创建新run之前校验；保存run.json前再安全读取确认指定journal原字节及设备/inode/其他读取身份未变，不能仅比较mtime。发生并发变化即失败，不宣称冻结成功。失败不覆盖任何既有run、原件、journal、oracle或旧证据；若已有新目录的partial证据，明确保留失败且换新run名，不复用覆盖。
- observe遇显式adoptedExistingSession时只读取该UUID并继续核对目录UUID/journal.id/owner、精确冻结源路径集合/hash/纳入状态及原安全投影；不回退扫描其他同名/同源新journal。未接续模式保持原逻辑。读取身份不可仅相信mtime；mtime仅用于root此前定位，最终由本UUID/owner/source/首次AI前条件授权。
- 前后journal身份/bytes不变只用于freeze绑定窗口。绑定后允许应用正常原子rename、revision/phase前进及AI结果写入，不能要求journal永远等于初始inode/hash或再次满足source零AI。后续以指定目录身份、UUID、journal.id、原createdAt、owner及冻结完整源集合持续绑定；只允许真实UI推进，不注入journal。
- 不导出原始授权、endpoint、Key或其它用户作品。safe projection及严格runtime parser、build identity保持；只额外记录接续元数据。模型调用/应用动作始终由真实UI执行，工具不发起或注入。

## 定向用例与顺序

新增隔离验证脚本仅使用临时合成corpus/journal，无真实数据/模型/DB：合法source接续（existing列表不篡改、指定ID绑定）；错误UUID/owner/链接/来源/hash/纳入状态拒绝；每种已AI/已分析/作者数据状态拒绝；容量与并发变化拒绝；指定ID观察不追随decoy，投影仍无秘密；不带新参数的新建freeze/observe保持原行为，不能覆盖旧run。

先原版真实RED（功能尚无接续模式如实记录），再最小GREEN/独立code review。仅两条精确工具检查，不运行全仓：

```sh
python3 scripts/verify-real-novel-source-adoption.py --output /private/tmp/novel-import-adoption-author-final.json
python3 scripts/verify-real-novel-runtime-observer.py --output /private/tmp/novel-import-adoption-runtime-author-final.json
```

两脚本输出必须exclusive创建；仅output文件路径允许为各次RED/GREEN/独审使用新的独占路径，测试脚本和参数范围不变，不覆盖前次文件。后者是已批准的24项脱敏/运行时观察边界直接回归，不测试模型质量。审核通过后root用实际S02 UUID新建`S02-20261026-C1`冻结并观察；失败不改期望、不手动注入。之后才通过UI识别/核对正文范围/12目标/复核/发布/查库/重开，整批标准不降。
