# 重开退出补充方案及用例独审

结论：通过限定验证基础设施TDD准入。只增`electron-normal-quit.mjs`、私有fake控制并接入重开验证脚本；不改产品范围或53文件产品cohort，最终源码/命令仍由482独审。

单一absolute deadline覆盖quit/evaluate及exit，只有期限前evaluate fulfilled且code0/signal null才成功，能够修复原finally两个无界await。timeout/evaluate reject事实永久保留，cleanup及迟到exit0独立记录，不能写acceptance成功；返回不可变事实，listener/timer须收束。

五组pure fake用例覆盖正常退出、evaluate悬挂、exit悬挂、evaluate拒绝及迟到/cleanup0。正常组同时应有nonzero exit/signal负控，验证code0与signal null两个条件都实际生效；不需要增加产品测试组。RED须是原无界行为的可执行控制（可用原finally适配fake与外部watchdog），不能把缺helper模块或语法失败记作功能RED。

helper、私有测试及重开脚本进入R73冻结hash；只在后续正常真实重开时验收，不新增App/API探针。退出未过则重开未过。forest比较只证明完整字段、父边、多重性及无环；生成数据库ID不冒称与artifact ID逐值相等，原完整材料/ledger另由离线snapshot深等。原R72未发布、未执行重开检查的事实及证据不改。本审核未App/API、未修改产品/测试。
