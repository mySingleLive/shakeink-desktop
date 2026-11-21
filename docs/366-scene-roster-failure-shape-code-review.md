# 首答失败安全分类：独立增量审核

结论：**限定范围通过，无阻塞，可进行R39正常fresh全书复验，无需重复只读供应商探针。**364/365及finish补充已由另一审核者按序通过。审核者未修改产品/测试、构建或启动App、调用模型、读取真实request/小说/回复/配置/Key。

- `generate.ts:208–213`只在自身StructuredGenerationError上best-effort附本次SDK白名单finishReason，先于首轮repair或末轮抛出。同一error、kind/message及错误身份保持；Object.defineProperty失败被隔离，不替换原异常。字段非枚举，`declare readonly`不产生旧实例默认字段；直接parser没有SDK结果时不发明stop，未知/缺失为unknown，不进入SDK options。
- `novel-import-ai.ts:562–577`仅原candidate undefined失败位置追加全锚定SRU1枚举。native来自本次实际合同状态，kind为原三值，finish为闭合七值；候选分类复用原parseJsonOutput(z.unknown)的fence/截取/兜底顺序。对象只判断own roster、数组、超限和额外键存在，不输出键名或值。它说明parser候选，不能解释成供应商完整原始根或历史原因。原预算失败优先及首1/次0不变。
- 独立在内存去掉这两处诊断增量，**完整generate和service SHA256分别精确恢复362的`b8a223e81ae0c7dea0b0e39d7799e78717991298636f575217efbbca2a25d652`、`60701720f3fd401a4cea38f4445641640253b9345855bc063cffcddcfc7a851c`**。其它输入、prompt/schema/opts、采用/拒绝、预算、两代、正常usage及原门逐字未改。main仍`701946c4…`，原UI safeError继续generic。
- 私有observer仅接受完整原前缀及固定顺序/闭合enum的SRU1；畸形该后缀在HTTP/Prisma“提及”分类前直接unclassified，未知数据不回显。其它委托、原型安装/恢复、getter/Proxy/toJSON、文件权限和队列逻辑保留。

实际独立执行，均使用`/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node`：

```sh
node --import tsx --test tests/unit/novel-import-scene-roster-failure-shape.test.ts tests/unit/novel-import-scene-roster-native.test.ts tests/unit/novel-import-scene-roster-native-budget.test.ts tests/unit/novel-import-scene-roster-choice-only.test.ts tests/unit/novel-import-scene-roster-targeted-repair.test.ts tests/unit/novel-import-scene-roster-targeted-budget.test.ts tests/unit/novel-import-scene-roster-repair-retention.test.ts tests/unit/novel-import-ai.test.ts tests/unit/novel-import-structured-scene.test.ts tests/unit/novel-import-structured-buffering.test.ts
node --import /Users/dt_flys/Projects/shakeink-desktop/node_modules/tsx/dist/loader.mjs --test /private/tmp/shakeink-scene-import-20261031/scene-rpc-failure-observer.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

产品必要10文件**217/217、exit0**（含UD36），私有observer **12/12、exit0**；日志`/private/tmp/scene-roster-failure-finish-independent.txt`、`/private/tmp/scene-roster-failure-observer-v4-independent.txt`。完整tsc exit0，`/private/tmp/scene-roster-failure-finish-independent-typecheck.txt`为空；diff exit0。不与作者301/主代理447或历史结果相加。

实际覆盖原error身份/不可枚举、附注失败仍抛原error、第二轮终止也附安全finish、直接parser无默认字段、未知finish和秘密哨兵、native开/关及fence候选分类、预算优先、原generic/native/CF/保留行为。已核作者初DI RED25为1pass/24fail、finish RED35为1pass/34fail；缺安全码/finish元数据为实际失败，后加附注失败控制在GREEN达36，不倒填RED节点。

冻结身份：

| 文件/产物 | SHA256 |
| --- | --- |
| src/lib/ai/generate.ts | 0b9b0aed386ada71a001e0d7d3b1c07537755aee6beaa59236bb0f71203134a5 |
| desktop/service/novel-import-ai.ts | 4014a2ee64faff6b64563eefe3a34ac025ba1a119d47c8c4723b010cdd7ef8d0 |
| tests/unit/novel-import-scene-roster-failure-shape.test.ts | 60efd1dce544af2dc248aa7973ea9e08f69c2700d658b0ef607fb2e0a08246a1 |
| 私有scene-rpc-failure-observer.ts | 6f96285f8559d1d6093eb80a0e034d976a367764a1ae5a207d9dfb41f04fc221 |
| dist/review/scene-rpc-failure-observer-v4.cjs | 7ee53210c9eeeaa161de1b62250168b9e82830e8a18d84d95175db77c6e36e9d |
| 私有run-r39-concrete-scene-full-acceptance.mjs | b0d62be639ed21872bdf0c582f1830ad8b32699d6c30051e51a3feba69b8d64e |

独立核对v4 manifest的21产品输入、8当前产品bundle均匹配，且8项与public build-identity-r39逐项相同。driver仅两个observer-v3→v4路径，替回后逐字等于R37，原计时/材料/选择/复核/发布/退出门未动；driver和v4 CJS的node --check exit0。未运行这些App脚本。

本次只增加安全观测，不修订或证明供应商的生成结果。R39新码只能描述新运行，不能追认R35/旧回复根因；全书、全部场景、作者确认、完整复核、发布和重开仍待真实验收。
