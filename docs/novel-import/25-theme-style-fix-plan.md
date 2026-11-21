# 导入对话框恢复应用主题样式：技术方案与定向用例

日期：2026-10-26。依据用户当前截图及“尤其按钮与设计稿不一致、保持当前主题样式一致”的修正。已有v4 UI批准仍有效，本轮恢复既有视觉层级，不新增流程或再次要求设计批准。待独立技术/用例审核。

## 原因与目标

`novel-import.css`用未分层`.ni-dialog [data-slot="button"]`覆盖共享Button的背景、颜色、边框、字体和尺寸，却再用不存在的`data-variant`选择器恢复default/ghost。真实`src/components/ui/button.tsx`只输出data-slot和实际variant utilities，没有data-variant。因此主操作被统一涂成背景色，ghost图标也有了实心背景和边框；hover filter/disabled opacity/统一svg大小继续压过主题组件。旧browser fixture只加载设计tokens与局部CSS，没有真实Tailwind全局样式，未发现这种cascade冲突。

正式组件必须继续复用共享Button；不通过给全站Button增属性或复制另一套按钮实现来补局部选择器。主操作使用主题primary，辅助outline和ghost/图标沿应用共享组件的尺寸、圆角、hover、focus及disabled状态。

## 最小实现范围

- `src/components/desktop/novel-import.css`：移除覆盖共享Button的paint/geometry/font/hover filter/opacity/svg尺寸及不存在的variant分支，保留布局与可用的手型/禁用语义。局部键盘outline仅服务原生控件，不再压过共享Button的focus样式。保持按钮原有variant/size和业务事件。
- 主弹窗按批准稿`preview.css`恢复border=input、background=chat-overlay（回退popover）、shadow=shadow-2；页脚同overlay。保留当前宽高、shared DialogContent居中、滚动/响应式结构及全部业务状态。其它面板、全站Button、全站主题tokens、源解析、后台导入/保存代码不修改。
- 新隔离`tests/helpers/novel-import-theme-fixture.tsx`复用现有真实导入React fixture，并另提供真正共享Button参照，不改旧fixture/旧断言。
- 新`tests/browser/novel-import-theme.test.ts`用已安装PostCSS/Tailwind从真实`src/app/globals.css`编译完整生产cascade，再加载真实导入CSS。不能用手写“Button近似CSS”或只测class字符串替代。

现有设计稿的尺寸/主题/来源选择与内容布局均保持；以当前应用真实Button的主题variant为准，不把静态原型的一套按钮CSS搬进正式组件。来源选择器/PDF子对话框已有独立主题样式，不泛扩。

## 定向用例

| ID | 必须验证 |
| --- | --- |
| NI-UT01 | 在玄墨/宣纸两主题下，真实主弹窗的enabled default、outline、ghost/icon和disabled按钮与同主题真实共享Button参照的computed paint/尺寸/圆角/opacity一致；物理hover及键盘focus效果同源。primary必须实际呈现主题primary而非黑底，ghost不被局部实心描边覆盖。初始56/60当前CSS上先取得真实RED，保留日志。 |
| NI-UT02 | source、select、confirm等代表页主表面/页脚符合chat-overlay、input边框、shadow-2 tokens；双主题1280×800、390×640及680×460内模态/页脚可见、无横向溢出，Tab焦点留在模态，禁用按钮保持不可触发，来源/补全checkbox状态无损。保存合成截图供视觉检查，不能将其计真实小说通过。 |

仅三项（新两case与现有布局保护），禁止全量：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-UT0[12]:' tests/browser/novel-import-theme.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-U02:' tests/browser/novel-import.test.ts
```

独立方案/用例审核后TDD；冻结后独立code review及相同精确命令。必要全项目类型检查、正式Turbopack UI构建（不能改用webpack）与desktop build另记；检查五个Monaco workers及PDF worker身份，不重跑无变更的全包测试。正式启动后在真实应用核对当前主题主/次/图标/禁用按钮及页脚样式，保留当前导入会话，不自动发送AI。

## 与真实小说任务的关系

当前原生界面已经被用户切到S02完整MD的来源核对；root不回退/丢弃它。此前C1停在原目录选择，尚未授权策略2重建或再次调用模型；安全退出快照178已留存。先完成本视觉修正并重新编译启动，再按实际会话状态继续整批真实小说测试。正文与任何设置不因CSS修正改变，不能把本轮视觉通过当作整书语义验收。
