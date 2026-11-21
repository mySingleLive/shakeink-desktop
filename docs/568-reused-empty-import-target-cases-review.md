# 568 删除作品后重用已清空目录导入 测试用例 · 独立审核

日期：2026-11-13。审核对象：`docs/568-reused-empty-import-target-cases.md`（下称“用例”）和 `tests/unit/reused-import-target.test.ts`（下称“测试”）。对照：`docs/567-reused-empty-import-target-plan.md`（下称“方案”）。本次未修改任何源文件或测试文件。

## 一、实测

Node 24.18.0，单独运行测试文件，耗时约 25 s：5 项通过，4 项失败。

| 测试 | 修复前 | 说明 |
|---|---|---|
| RT-01/03 | 失败 | 断言 `protectedDirectories()` 不含 D，失败在第一个断言 |
| RT-06 | 失败 | 同上 |
| RT-07 | 失败 | 同上 |
| RT-11 | 失败 | 抛出“保存目录不能与来源或应用目录重叠” |
| RT-02/04、05、08/09、10、12 | 通过 | 这些是回归或安全用例，修复前通过属于正常 |

失败的项与修复目标一致，失败原因都是本次缺陷，没有夹具错误。

## 二、覆盖核对

- 用户约束（目录为空或不含本项目存储文件时允许重用）：RT-01、03、06、07、11 覆盖了空目录、只有 `.DS_Store`、目录已不存在和 pending 预留几种情形。但“不含本项目存储文件、却有其他文件”的情形没有用例，见中1。
- 列表中的作品：RT-04 只测了目录里还有文件的情况，没有锁定“列表路径无条件受保护”，见高1。
- 残留文件：RT-05 的条目与方案基本一致，但漏了“`.shakeink*`/`.xuanxiang*` 任意条目”这条规则，见中2。
- 读取失败：RT-10 覆盖了 `EACCES`。方案里的 `ENOTDIR` 没有用例，见低1。
- 旧请求重放：RT-09 只覆盖 `complete` 预留经 `create` 重放的路径。方案“为何安全”第一条写的 pending 预留恢复或丢弃不会删除新作品，没有任何用例，见高2。
- 控制器：RT-11 和 RT-12 走的是真实的 `chooseTarget`。断言写得偏弱，见中3。

## 三、问题（按严重程度）

### 高1：缺少“列表中的作品目录清空后仍受保护”的用例

RT-04 中，列表作品的目录里有完整的存储文件。如果实现把“含存储内容”的判定错误地套到所有路径上（包括列表路径），RT-04 照样能通过。方案第1条规定列表路径“始终受保护（不变）”，现在没有用例能区分这两种实现。

要求：增加 RT-04b。在 D 中 `create` 作品 A，不删除，清空 D（或只保留 `.DS_Store`），然后断言 `protectedDirectories()` 含 D，并断言 `chooseTarget` 仍报“重叠”。

### 高2：pending 旧请求在新作品建成后被恢复或丢弃，没有用例

方案把这条列为放宽保护后的主要安全依据：旧 `pending` 请求如果之后恢复，`importLeaseTarget` 和 `discardImportCreation` 会读到清单里的 `requestId` 不一致，于是拒绝或者 `kept`。RT-07 只测了“空目录 + pending 预留，丢弃后返回 `none`”，目录里还没有新作品，所以真正危险的情形没有覆盖：放宽保护以后，新作品 B 写进了旧请求仍然预留着的目录。

要求：增加 RT-07b。
1. 为导入请求 R1 建立 pending 预留，指向空目录 D（写法同 RT-07）。
2. 确认 `protectedDirectories()` 不含 D，然后用新请求 R2 在 D 上 `create` 作品 B。
3. 断言 `discardImportCreation(R1)` 返回 `{state:'kept',reason:'目录已属于其他作品'}`。
4. 断言 `importLeaseTarget(proof(D),R1)` 拒绝，报“原导入目录请求不匹配”。
5. 断言 D 的条目和 B 的清单字节都没有变，B 仍在列表中，R1 的预留没有被删除。

用例表中 RT-07b 的期望一栏写上方案对应的原文。

### 中1：缺少“目录有其他文件、没有存储文件”的情形，用户约束的另一半没有验证

用户约束是“为空**或不含本项目作品存储文件**”。按方案，这种目录不再受保护，但 `chooseTarget` 和 `create` 仍然要求目录为空。也就是说，重用的旧目录和从没用过的目录走同一条规则。用例没有写明这一点，测试也没有覆盖。

要求：增加 RT-13。删除作品后清空 D，再写入 `notes.txt`。断言 `protectedDirectories()` 不含 D；断言 `chooseTarget` 报“请选择空目录，用于保存导入的作品”，不报“重叠”，结果与一个新建的同样内容的目录相同。用例中要写明：其他文件依然会被空目录检查拒绝，这是现有行为，本次不改变。如果用户希望含其他文件的目录也能直接使用，那需要另行确认，不在方案 567 的范围内。

### 中2：RT-05 缺少通用的 `.shakeink`/`.xuanxiang` 前缀条目

方案第2条单独列出“以 `.shakeink` / `.xuanxiang` 开头的任何条目”。RT-05 里所有以点开头的名字（`lock`、`audit`、`restores`、`preserved` 和三个前缀）也都符合这条前缀规则，所以两种错误实现都能通过：一种只检查前缀，另一种只检查具体名字、漏掉通用前缀。

要求：
- 增加 `.shakeink-unknown` 和 `.xuanxiang-unknown`，以检验通用前缀规则。
- 至少有一项用目录形式写入（例如 `database/`、`.shakeink-restores/`）。真实残留中这些通常是目录，加上这一项可以防止实现用 `isFile` 过滤。
- 其余条目与方案一致：两族 7 个具体名字、3 个前缀、`database`、`assets`、UUID `.tmp`。断言消息里已经带上了 `name`，这个写法保留。

### 中3：RT-11 的断言偏弱，和用例表写的不一致

- `ImportView` 确实有 `targetLabel?:string` 和 `error?:string` 两个字段（`desktop/shared/novel-import.ts:155`）。但 `chooseTarget` 遇到重叠时直接抛错，`act` 会拒绝，不会把错误写进 `view.error`。所以 `assert.doesNotMatch(view.error, /重叠/)` 在任何情况下都通过，起不到检查作用。真正让测试失败的是未捕获的异常。
- `targetLabel` 在向导会话中是目录名（`desktop/core/novel-import.ts:402` 末尾，`split(/[\\/]/).at(-1)`），否则是完整路径。临时根目录本身就叫 `reused-import-target-*`，所以无论 `targetLabel` 是完整路径还是任何子路径，`includes('target')` 都成立。
- 用例表写的期望是 `s.target.path === D`，但测试拿不到会话，实际检查的是视图字段，两者对不上。

要求：
- 测试改为断言 `view.targetReady === true` 和 `view.targetLabel === basename(f.target)`（如果实际是完整路径，就断言 `=== f.target`）。
- 去掉 `view.error` 断言，或者改成 `view.error === undefined`。
- 类型用 `ImportView`，不要手写的 cast。
- 用例表的期望改为“`chooseTarget` 不抛错；视图 `targetReady` 为真，`targetLabel` 为 D 的目录名”。

### 低1：RT-09 的拒绝原因没有锁定；`ENOTDIR` 没有用例

- RT-09 用的是不带匹配条件的 `assert.rejects`。按代码路径，重放应当报 `REQUEST_CONFLICT`“此目录属于其他建书请求，请核对原请求”（`workspaces.ts` 中 `create` 非空目录分支）。要求加上 `/此目录属于其他建书请求/`，并比较 B 清单的字节，不只比较条目名。
- 方案写了 `ENOENT`/`ENOTDIR` 都不受保护，RT-06 只测了 `ENOENT`。要求在 RT-06 中补一步：把 D 换成一个普通文件，断言不含 D、不抛错。

### 低2：台账与真实目标

- 用例表没有写对应的 `NI-19`。要求每条 RT 都标注 NI-19。
- RT-R1 用的是“新建作品后删除”。用户报告的路径是“导入作品后删除，再导入”。要求 RT-R1 改为：先完成一次导入（或用已经导入保存的作品），在应用里删除，用 Finder 清空 D（会留下 `.DS_Store`），再导入并选择 D。另外加一条对照：不清空 D 时仍然报重叠。两条都要截图。
- RT-08 修复前也能通过（`create` 不读受保护列表），它属于回归项。用例中应注明这一点，免得被当作修复证据。

## 四、结论

**有条件通过，需修改后实施。** 现有测试与方案一致，失败的项正好对应缺陷。必须补上高1、高2：列表路径无条件受保护，以及 pending 旧请求遇到新作品时失败封闭。这两项是方案“为何安全”的依据，目前没有测试支撑。中1到中3需要在实现前改完。低1、低2可以和实现一起改。
