# 94 世界/设定归属修复实施证据

按最终 94（`b675a51d769ef0f29e07c16131698f7caeef5567493dabb37bd838ab65f55597`）与 95 的 WG-TR01/02/03 实施。作者版已冻结，等待 96 独立代码审核；没有执行真实旧作品修复，没有修改实际应用、模型、来源、journal 或用户数据库，不能据此宣称 RB-WORLD-FIX01 或旧 S01 文学质量通过。

新增 `desktop/service/novel-import-world-repair.ts` 和 `tests/integration/novel-import-world-repair.test.ts`。CLI、现有锁函数声明的唯一 export，以及 payload/A10 由父代理指定的独立文件 owner 实施，最终六文件身份集中在 [冻结清单](evidence/world-setting-repair-final-freeze.json)。原 AI service、main 和 request-schema 测试的控制 SHA 均未变化。

服务导出 `worldRepairPlanSchema`、`worldRepairHash`、`worldRepairProtectedRowsHash` 和 `repairWorldSettings`。严格计划绑定 run/work/application/owner/novel/原导入 request、多重文件身份和 hash，完整七旧行及一根七设定的新 ID；默认 dry-run。`worldRepairHash` 先按 JSON 语义规范 Date/undefined，再递归排序对象键；嵌套数组顺序保留。protected hash 仅取清单规定的十三组原业务行，各组按 id（PlanningDocument 用 novelId）排序；不含 worlds，提交后只排除计划新建的七个 Setting ID，原 NOVEL_IMPORT 快照和回执仍参与 hash。

apply/rollback 使用 Serializable 事务、现有操作锁和 World 树锁，事务内重新核对 owner、完整基线、保护 hash、引用和历史闭合矩阵。其他作品的入边仅查询 existence/count，不读取其业务正文。仅本作品的 planning 和 StoryArtifactLink 做已批准的引用检查。apply 完整保存七段说明为 Setting text；rollback 按专属完整 before/after 快照及 CAS 恢复七旧行和日期。后续编辑、子世界、附属 Setting、历史或引用均阻断。专属 `NOVEL_WORLD_SETTING_REPAIR` 审计不改原导入审计。

before/preview 必须 wx/fsync 成功后才开始写事务。commit 后 after/ack 导出失败返回 `committed-export-failed`；丢失确认且无法安全查询回执返回 `acknowledgement-unknown`，不能假称回滚。CLI 对这两种状态返回非零；只有 closed 且 dry-run/committed/restored 返回零。CLI 不调用 Workspaces initialize/run/connect、不迁移/seed/扫描其他数据库；引擎自身启动、租约和 WAL 行为不被声称为文件系统零写入。

真实初始 RED 保留在 [initial-red](evidence/world-setting-repair-initial-red.txt)：新增 WR01/02 因 service/CLI 尚不存在而失败，0/2；它是实施前缺模块 RED，不是 PGlite 行为断言。最初基础实现 2/2 和完整 CLI 初次集成 2/2 也分别保留。首次扩展矩阵中的非法 enum/缺必填字段/被既有 planning decoder 容忍的未知字段是新增 fixture 错误，原日志 [matrix-first](evidence/world-setting-repair-matrix-first.txt) 未覆盖或改称生产缺陷。随后按真实 schema 修正合成 fixture。

末版限定结果均 exit 0、fail 0、skip 0：

| 精确命令（Node 均为 `/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node`） | 结果 | 原始日志 |
| --- | --- | --- |
| `--import tsx --test --test-name-pattern='^NI-A(07\|08\|09\|10):' tests/unit/novel-import-ai.test.ts` | 16/16 | [A07–10](evidence/world-setting-repair-a07-a10-final-green.txt) |
| `--import tsx --test --test-name-pattern='^NI-WR0[12]:' tests/integration/novel-import-world-repair.test.ts` | 23/23 | [WR01/02](evidence/world-setting-repair-matrix-startup-green.txt) |
| `--import tsx --test --test-name-pattern='^NI-SEM-P01:' tests/integration/novel-import-semantic-publish.test.ts` | 1/1 | [SEM-P01](evidence/world-setting-repair-sem-p01-final-green.txt) |

两个自有新文件在当前 tsconfig 下的 owned TypeScript 诊断为 [0](evidence/world-setting-repair-owned-typecheck.txt)。未执行全套测试、构建或实际应用。

WR01/02 使用隔离真实 PGlite：内存业务矩阵及 `/tmp` 完整 CLI 正准入，覆盖 dry-run/apply/replay/rollback、正文 CRLF/非 BMP 和所有保护行逐字不变、引用/历史/身份/指针/迁移账本/活租约/别名/证据不覆盖拒绝。中途写失败和最终提交前拒绝均验证事务回滚；commit 后确认丢失、ack 导出失败和未知确认分别验证实际已提交状态与幂等回执。启动异步拒绝、同步构造抛错和 close 失败是实施后受控故障注入：经过完整真实准入后才由批准的窄构造 DI 触发，断言零 service/查询、实际租约在关闭确认前保留。它们不是实施前 RED，也不当作真实引擎成功证据。

自有两新文件的完整 `/dev/null` 增量为 [owned-final-delta](evidence/world-setting-repair-owned-final-delta.diff)，SHA `3425890feaf38136cb1523c9699434b2b06a7fb2778e19641d73b48b7e018e3d`。冻结 manifest SHA `1bca4d5a93826f40744c2219ca86c40bd320d765b24855e3e3205b7959dd0796`，含六文件完整 SHA、三条精确命令和日志 SHA；CLI export/启动/退出策略增量另由其 owner 保存在同证据目录。后续真实 dry-run/apply 及独立复核由父代理执行。
