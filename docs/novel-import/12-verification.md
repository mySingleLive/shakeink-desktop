# 导入作品定向验证

2026-10-25 至 2026-10-26；Node v24.18.0，macOS arm64。所有输入为合成内容/有许可的解析器夹具，使用临时目录；未运行全仓测试。

## 自动化结果

| 范围 | 实际结果 | 证据 |
| --- | --- | --- |
| NI-P/F/D/S/A/L/W/B，7个指定文件 | 51 tests / 51 pass / 0 fail / 0 skip，包含事务故障子用例 | `evidence/targeted-final.txt` |
| NI-U01..07，真实React+受控bridge | 7 tests / 7 pass / 0 fail / 0 skip | `evidence/ui-final.txt` |
| NI-B01依赖搜索路径回归 | 已含于51项；先红后绿的单项复核1/1 | `evidence/runtime-dependency-red.txt`、`runtime-dependency-green.txt` |

Node测试命令严格限定08文档列出的文件。额外NI-B01小回归放在同一导入接线文件，用真实临时依赖树复现JSZip的同名builtin npm依赖，不是全仓打包测试。

## 构建和资源

`generate-command-catalogs.mjs` exit0：macOS422、Windows406条既有命令注册集合，包含两个新增导入菜单。`next build` 与 `build-desktop.mjs` exit0；最终样式按实际生产CSS再次构建。`tsc --noEmit` exit0；真实生产CSS额外核对无自有重复位移、共享Dialog位移保留（ui-built-position-green.txt）。这些是编译/资源检查，不充作功能用例。

新增运行依赖在构建manifest中，Word/HTML/ZIP解析器metadata及PDF worker/CMaps/standard fonts/WASM均在本地；5个本地图标及MIT许可存在。安装包执行没有由资源存在性推定通过。

## 原生与外部条件

| 编号 | 当前状态 |
| --- | --- |
| NI-N01 macOS | 通过：真实文件picker与目录picker分别选择合成正文、正文+大纲文件夹，实际保存至独立空目录；原文/大纲逐字回读，现有概览面板可用，正常关闭重开后两部作品保留且无未完成导入；外部请求0。见 `evidence/native.json` 与两张 native-*-complete.png |
| NI-N02 Windows | 未执行：当前没有真实Windows目标；没有使用UA/外观模拟替代 |
| NI-N03供应商 | 未执行：隔离验收没有使用真实文本及审核供应商端点；受控AI只证明协议、证据、状态和取消，不能证明供应商质量 |

原生脚本 `scripts/verify-novel-import-native.mjs` 使用已安装官方Electron的唯一测试副本，复用前核对二进制内容；每次创建全新数据根并检查worker所属路径。原生picker不被stub替换，由Computer Use只操作该唯一应用标识。最初同名Electron定位曾返回已有窗口，未进行写操作；随后自动审批拒绝不具备隔离证明的重试，增加进程/路径/空库守卫并使用唯一bundle ID后才获准继续。没有操作已有用户作品。

## 已知边界

- 含栅格图像的PDF保守拒绝，包括扫描正文附带可提取页码的情况；需外部OCR或转纯文本，不能把页码当全文。
- 识别/分析为真实后台状态，无模拟完成计时器；模型调用前后固定配置和授权，仍须真实端点验收。
- 1GiB journal边界为缩放容量验证，未声称做过1GiB物理压力测试。
- 复核发现的原材料记录、两条线关联、恢复身份、来源父链、累计限额、冻结发布恢复和生产CSS定位问题均保留审计经过；结论须结合四份11系列独立审核及最终原生结果读取。

## 最终结论及命令

自动化共58个测试通过、0失败、0跳过，覆盖49个唯一用例编号（部分故障/回归属于同一编号的子例）；macOS原生NI-N01另行通过。NI-N02与NI-N03保留未执行，不宣称所有外部目标或安装包验收完成。

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/novel-import-protocol.test.ts tests/unit/novel-import-files.test.ts tests/unit/novel-import-domain.test.ts tests/unit/novel-import-session.test.ts tests/unit/novel-import-ai.test.ts tests/unit/novel-import-integration.test.ts tests/integration/novel-import-publish.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/browser/novel-import.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node scripts/verify-novel-import-native.mjs
```

原生运行的最后一条命令实际使用 `SHAKEINK_IMPORT_NATIVE_RUNTIME` 指向已核对官方二进制的唯一标识测试副本，复用副本但每次数据根全新；选择器由Computer Use操作，不替换picker返回值。脚本以实际子进程PID及bootstrap/dataRoot检查隔离。正常关闭时Electron保留若干“请求已取消”的IPC诊断、测试副本有sandbox-extension提示；没有把这些写成“无stderr错误”，renderer pageerror列表为空且重开后的内容/目录已校验。

晚期组合回归还实际覆盖：新记录命令必须出现在迁移台账和生成路由内；保存标题后一次点击选目录必须等待回执；完成页关闭或后台完成也刷新作品列表；导入日志纳入真实数据根搬迁并恢复相同会话。未知相邻文件保留在旧根，测试如实接受仅该保留项导致的cleanup-pending，不强删用户未知内容。
