# 94固定world指导子任务：A10实施证据

2026-10-27。实施者：`cross_platform_picker_design`。本子任务只写payload、A测试新增NI-A10及本人的实施证据；不涉及修复服务、CLI、Workspaces或WR测试。尚待96独立代码审核，不自行宣称独审PASS或真实作品修复通过。

## 基线与最终冻结

已读94最终 `b675a51d769ef0f29e07c16131698f7caeef5567493dabb37bd838ab65f55597` 和95最终PASS `8f5b9db407c9fca102c173605336145dde906ce56f6389dd1b13524e1db448d4`。

| 文件 | 修改前SHA-256 | 最终SHA-256 |
| --- | --- | --- |
| desktop/core/novel-import-ai-payload.ts | `239cac9bf2f40c7e1004ffb28cfc36ff834f98b549f6ae7326cfafb42187ab55` | `87b9c0c12a73df06e22c9ccda4d9ccec272bd95baffb56e32c4c0baa953855d6` |
| tests/unit/novel-import-ai.test.ts | `663097fb08265b6467aafc43223724b88287cfcc6c27342c84716206cf9c9903` | `401630f0fbef55ad0c4d7fed37d491c66e2d69050786a9ea94d2e14b898d2d28` |

原文件副本保留在 `/tmp/shakeink-a10-world-guidance-20261027/`。完整自有差异见 `evidence/world-guidance-a10-20261027-owned.diff`，比较的是该授权基线与最终文件，不混入仓库其他人的未提交改动。原A测试文件整个字节前缀保持相等，新A10仅追加；A07–09原断言/预期无修改。

## 最小生产变化

仅增加固定world归组段及其触发判断，并在原固定段前拼接；不改变序列化、原输出合同或其它固定段：

- 只进入semanticVersion1。普通analyze以kind=world判断；reconcile以targetIds对应的实际world artifact判断，即使request.kind旁带另一类别也不会误判目标；review以selectedTargets包含world判断。
- 同世界的社会、习俗、经济、地理等资料归SETTING/worldId及既有九类型原生content；单一未命名世界可用空介绍中性容器，同世界跨批复用已有world ID。
- 来源支持的独立、平行及上下层世界保留；不强制单世界、不无据合并、不按书名/人名/条目标题/关键词/格式猜型。固定段没有具体小说、角色、旧条目、原句或oracle答案。
- reviewProjection、已有实体三元组与片外未验证边界保持；reconcile仍仅改明确targetIds与允许字段，守锁、来源、正文及ID/kind/name权限。

legacy、classify、patch及无关目标保持原字节；预算65536/16384、schema、重试、授权、校验晚门和任何实际导入信用均未修改。真实模型是否服从及文学质量仍另验。

## 真基线 → RED → GREEN

生产修改前独立捕获9个无关分支的prompt/payload字面SHA及73/82/native固定段SHA，存于 `evidence/world-guidance-a10-20261027-baseline.json`。捕获脚本仅调用纯payload/prompt helper，没有模型或实际数据访问；当时payload仍为授权239cac…ab55。A10预期使用这些已冻结字面，不拿修改后输出自证。

测试仅执行下述精确命令，三轮均相同：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A(07|08|09|10):' tests/unit/novel-import-ai.test.ts
```

1. `evidence/world-guidance-a10-20261027-red.txt`：exit1。真实runImportAi已产生正常合成typed结果，随后缺固定归组段断言失败；另有新A10夹具断言误把未知worldId的旧错误期望为“归属引用”，实际是“模型结果含无效实体引用”。该额外失败属于新增测试正则错误，未说成生产缺陷。
2. 仅修新A10的该正则，生产仍未改；`evidence/world-guidance-a10-20261027-clean-red.txt`：exit1。A10仅“实际生成路径缺归组固定段”的子项失败，其余两子项及A07–09通过，取得干净生产行为RED。两轮历史均保留。
3. 最小payload实现后，`evidence/world-guidance-a10-20261027-green.txt`：exit0；Node报告16/16（4顶层组及12子项），无跳过。没有旧hash冲突，也没有更改旧预期。

A10实际runImportAi DI涵盖普通world、targetIds实际world但request.kind为trope的reconcile、含world的review及无artifact的review；role、模型、同一AbortSignal、原request/raw/数据封套逐项核对。合成正常结果含中性空介绍WORLD、独立WORLD、有父WORLD及同已有worldId下九类型SETTING，保持原native/图门；notFound、空修订/复核原结果不变。

反例覆盖旁带world上下文但普通非world（selectedTargets仍含world）、明确修订其它目标（kind仍world）、review未选/空选/无selectedTargets、classify/patch/legacy九组字节保护。固定段在不可信数据外，恶意自由词和原文不进入固定段；73、82及完整native段SHA保持。长/非BMP/引号/反斜杠/换行输入仍满足原payload与wrapper预算。投影缺口、锁值覆盖、范围外目标、ID/kind/name额外编辑键、未知world引用及空native结构继续拒绝。

## 专用类型检查

仅两份自有根文件及必要传递依赖，继承仓库严格配置；include为空、关闭incremental，不跑全仓include。配置见 `evidence/world-guidance-a10-20261027-typecheck-config.json`（原运行路径 `/tmp/shakeink-a10-world-guidance-20261027/tsconfig.json`）。

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node node_modules/typescript/bin/tsc --project /tmp/shakeink-a10-world-guidance-20261027/tsconfig.json --noEmit
```

exit0，日志 `evidence/world-guidance-a10-20261027-typecheck.txt`。未执行全套测试、真实app/run/corpus/数据库/模型API，也未触及旧作品修复工具或实际迁移。最终两源文件停止写入，交96独立复审；旧小说文学FAIL和截图数据实际修正结果仍由各自流程核验。
