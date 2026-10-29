# 64/65 人工章界保持窄修实施证据

日期：2026-10-26。64 方案 SHA `602c7a81fd7bebe753cc5532b955522e1f59a18106e6249e72499364daf44fd4`。仅 core 的 importSessionChapters 及新 CH04/S12；三个文件已冻结交 66 独审。没有读取实际 S02、journal、源文件、oracle、应用或模型。真实 rev13 失败不回填为通过，后续原 UI 验证由 root 执行。

## 最小变化

生产只新增一个分支：semantic1、无显式 cuts、已有 manual 且非空章节、content 均为字符串并逐字拼接等于当前非空 text 时，仅沿用 start/title，交既有 importChapters(text,cuts,1) 重建校验。原 manual/diagnostic 不改；非法起点、标题、顺序或 surrogate 边界仍抛原错误，不 catch 后回退。

显式新 cuts、auto、正文任何变化、无完整人工章节及 legacy 均沿原路径。不改 detector/正则、main、UI、预算、授权、保存/发布、schema 或卷字段。

## 实施前真实 RED

三个真实当前基线另存 `/private/tmp/manual-chapters-64-baseline/`：core `854c734d…93dbc`、CH test `3ae06c71…8dbfc`、session test `617127bf…c07c4`。未覆盖其它历史基线。

仅添加新测试后、生产仍未改时实际执行：

- [CH03/CH04 RED](evidence/manual-chapters-ch03-ch04-red.txt)：原 CH03 通过，新 CH04 失败，人工三段被重算为一段未分章正文。
- [S12 RED](evidence/manual-chapters-s12-red.txt)：真实隔离 controller 的 choose/分类/set-chapters 后，人工十四单元仅经 local 分类就丢为一章；当时 AI 调用仍为 0。

RED 之后修正一个未到达的新增反例：原测试把合法位置 1 当作非法起点，改为真正非法 -1；原行为 RED 与旧断言均保留，没有放宽生产校验。

## 最终限定验证

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-CH0[34]:' tests/unit/novel-import-chapters.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-S12:' tests/unit/novel-import-session.test.ts
```

| 最终日志 | 结果 |
| --- | --- |
| [CH03/CH04](evidence/manual-chapters-ch03-ch04-final.txt) | 2/2，0 skip，exit 0，368 ms |
| [S12](evidence/manual-chapters-s12-final.txt) | 1/1，0 skip，exit 0，556 ms |
| [必要静态诊断](evidence/manual-chapters-typecheck-final.txt) | 当前 tsconfig/noEmit/incremental:false，三个 owned 文件 diagnostics 0，exit 0 |

CH04 逐项比较全部章节 ID/title/start/end/content、manual/diagnostic、精确原文/hash；显式新 cuts 生效，同长度改字/追加正文不复用，auto/legacy/空集合沿原，负数/重复/失序/surrogate 起点及空标题均经原校验拒绝。

S12 只使用合成十四单元，经实际 controller/journal 验证 local 零 AI、DI 分类实际完成、close/new controller initialize/reopen 后再 local 均保留相同人工章界、原文、来源、selected/targets/infer。所有回调限定 classify；无 analyze/review/publish，原/工作正文仍空、workingRevision0、无产物或作者决定。DI 完成不是实际供应商质量证明。

未运行其它 suite，未删减原 CH03 或旧 session 断言。

## 冻结 SHA-256

```text
6a11e1ef0ba7b66a89a070b38b5e134302b920a379c86ef2b489b1b5959971ef  desktop/core/novel-import.ts
006fcd00a9be86ea4e5dae864192317720229eea916b9cdc8777bf137732298a  tests/unit/novel-import-chapters.test.ts
68c79febb1c96ba8cf9593ac6070c5927dfa753e75eb6c365f84b2751017c814  tests/unit/novel-import-session.test.ts
```

[完整三文件差异](evidence/manual-chapters-implementation-delta.diff) SHA `a0d32fc978906105caf5fd32febaa67b62ad7581e813af70d21a015c45bf12fb`。独审及构建后，真实同 S02 必须通过原 UI 重新确认十四单元、本地确认并独立比较，不能手写 journal 或修改 oracle 替代。
