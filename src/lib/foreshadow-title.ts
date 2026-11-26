/** 新建伏笔的默认名：取未被占用的最小 n（只认精确的“未命名伏笔 n”）。面板 + 与作品菜单共用。 */
export function nextForeshadowTitle(titles: Iterable<string>): string {
  const names = new Set(titles)
  let n = 1
  while (names.has(`未命名伏笔 ${n}`)) n += 1
  return `未命名伏笔 ${n}`
}
