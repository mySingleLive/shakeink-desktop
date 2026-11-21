# 普通来源重新选择：独立方案审核

2026-10-27。**最终技术方案PASS、限定用例PASS，无剩余P1/P2；SR-TR01关闭。** 绑定99最终SHA `47bba0daa6602b9fbd565ece608ede8f312162fedf6573e430a67c8af9481942`。仅只读方案及已知main/shared、文件读取/编码、PDF/候选提交、真实React与桥接接点；CodeGraph不可用。未实现、运行测试或访问真实M01源、journal、app/DB/model。

## 首轮NOT PASS与修订关闭

初版99 SHA `efd51d06c30ee8b82762993581a270dc357a3d155fa9cc8ee6ab3e7be59904cf`存在**SR-TR01（P2）**：先要求fresh scan无error，再按旧确认encoding重读，会误拒合法无BOM UTF-16。`novel-import-files.ts`的scanner在默认解码前已保存完整proof/ancestors/hash；默认NUL检查失败不代表旧确认编码无效，既有redecodeNovelFile可按新proof安全重读。已先报主代理，首轮技术/用例NOT PASS保留。

第3/4点与SR01/02现明确完整fresh FS/大小/授权/字节门→同path/format/hash/bytes→按旧确认编码重读→最终无error/待确认且text/encoding精确相等→严格verify；不按error文案猜原因，不恢复缺完整读取身份的安全失败。DOC/DOCX仍直接拒scan error。SR01补无BOM UTF-16、GB18030及真实HTML/DOCX/已有许可test01.doc，SR-TR01关闭。

修订版SHA `7cc1b346bb28afc0650cc5b38505149d6c26e82f7726f67f02f43a491430aa8a`已审核PASS；随后最终47bba版补充旧→新身份授权说明，该段也已核对：旧proof不需再次通过；同canonical path/字节/解释下，新inode/ancestors可经用户主动grant更新。安全反例指fresh capture到scan/verify期间再次漂移，不能把更新功能变成要求新旧proof相同。本文结论绑定最终47bba版。

## 批准边界与限定用例

后端须在picker前限制前分析空闲状态，禁止已有分析信用、工作修改、作者决定、发布或在途请求；界面隐藏不代替此门。现有action只传id/revision/fileId，路径只来自native picker。仅clone更新目标proof/ancestors，原session/fileID、全文、分类、顺序、手动章界与预算等保留；撤销发送grant/checkpoint并回source，不自动AI或发布，原sourceReady及发送前严格验证不放宽。

候选helper第三参仅令本入口磁盘停车点为paused/resumePhase=source；默认running及旧调用不改。SR03须验证pre-rename失败保旧、post-rename后验失败live等真实已提交候选并blocked、重开保持业务。PDF原函数/token/cache与其它文件确认保持。UI复用既有SourceScreen和共享outline Button，不改主题/布局/增加独立弹窗；用户明确要求补入口，无须另创UI审批门。

仅99既定四条精准命令：SR01–03、U12、两条PDF04及精确PDF08生命周期用例、R02候选提交边界。helper签名会变化，R02须执行；不扩全suite。取消/拒绝、fresh漂移、旧编码、章界/grant保留、真实提交边界及真实组件桥接/双主题窄窗均有定向要求；合成桥不作原生平台证明。本轮未执行命令。

PASS仅授权限定TDD及101独立代码审核。实际M01须保留原零AI草稿与失败证据，正常退出/构建重开后从新入口选同原件并核对全部保留字段，再单独授权识别；不手改journal，不把入口或机械保存通过当M01/S02文学通过。
