# 386 无损修复目录独立代码审核

结论：最终冻结增量通过，无阻塞项。可由主代理完成构建冻结后执行 R44 正常全文验收。本改动只减少修复目录的重复编码；不宣称解决 R43 的资料保留失败，也不代表全文导入、发布或重开通过。本审核未启动 App/API、读取真实小说或模型回复。

已按 384/385 及两份独立审核检查三产品文件。`compactEntries` 从原 request-local Stored 逐项导出原 ref、完整 UTF-16 范围、当前 unitIndex、literals、sourceRef 和 flags；条数、顺序和窗口均保留，返回值及内部 literals 冻结。原 entries、私有 Anchor/map、CF 生成和 resolver 未改。逐项按完整 units 切片与原 resolver 深等，涵盖长非片段窗口、整单位、多位置、重叠、astral/CRLF 及请求顺序变化。整单位原已省略 quote，不把它计作本次长引文节省。

targeted 仅改变展示目录的类型和调用；service 仅增加静态范围阅读说明，模型仍只回 choiceRef。内存逆向删除新增 index/compact API、还原两处 compact 调用及删除新增说明后，三个完整源文件分别精确恢复 R43 冻结哈希。原完整源文本、keep/good rows、原草稿及当前回复、native first/repair schema、四代状态、来源/owner/retention/final 门及每次实际 prompt/schema 预算均未变。未实施 claim patch。

新 CC 的真实 SDK 合成桥证明完整长窗口与原 canonical 深等、选择数量不减、实际 UTF-8 目录下降，并在原固定预算与实际容量 N/N-1 边界严格通过/拒绝。坐标混键、伪 ref、伪 sourceRef 及越界仍拒绝。positive fixture helper 只从显式当前 units 精确还原完整窗口，核验 CF 绑定，不选首项或缩窗；CO 只改 Plan/cf 编码 helper，其后 bridge 与原断言逐字不变。

首次组合出现两个原 16K 正控的预算回归，最终仅把新增说明从 293 压为 84 UTF-8 bytes；原模型容量、材料、测试断言和预算门未放宽。最终独立组合包含这两个正控，实际两代成功。旧失败记录保留，不将首次失败版本记为通过。

## 实际独立验证

- Node 24.18.0 九文件 **191/191**：CC、CO、choices、TR、RR、TR05、ER、native、identity-service。日志 `/private/tmp/scene-repair-compact-choices-independent-final.txt`。前一版本 147 节点与本轮重叠，不相加。
- 独立 `node node_modules/typescript/bin/tsc --noEmit --incremental false` exit 0，日志 `/private/tmp/scene-repair-compact-choices-independent-typecheck-final.txt` 为空。
- 最终三产品哈希与 owner 冻结一致；`git diff --check` exit 0。
- R44 driver 与 R43 字节相同；final/snapshot verifier 仅 R43/R44 标签替换。driver、verifier、freeze 脚本 `node --check` 均 exit 0。PRIVATE v5 source/CJS 及其 21 个产品依赖哈希逐项不变；未重建 observer 或执行验收。

测试命令为 `/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test` 加上述九个 `tests/unit/novel-import-*.test.ts`，均使用合成 fixture，不作为供应商实际行为证据。

## 最终 SHA-256

| 文件 | SHA-256 |
| --- | --- |
| choices | `d1f168580ec8f4549caf43e6e4a22e7b619ce9f0f735c3a769eb7696849ac804` |
| targeted | `12aefe621636025014ed72f3b7a56bc0686b136922e341c1ab6fd35aa6e587ee` |
| service | `689eb5b8d530cdec452a1bdf3e4e963d954aa787f03007ee2f2b53a0bb304c72` |
| positive fixture helper | `bb425067404fe3d183e5e47fe693030335aa9417b4475e493ce072f7066c0bf8` |
| CC test | `c5c4f3c6838a7f4ad74106678adca8580af014940d3bdb9b56c03b0053ac031b` |
| CO test | `52719c4702fe3031973977ec69291b3b58810f5997b0670096d90b5329bd823b` |
