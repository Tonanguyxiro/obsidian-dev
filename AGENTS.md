# obsidian-dev 工作区 — 测试方法

本工作区放多个 Obsidian 插件仓库（`obsidian-gantt-calendar`、`timeline-for-bases` 等）和共用的测试库 `plugins_test`。
各仓库自己的构建/代码约定见其目录下的 `CLAUDE.md` / `AGENTS.md` / `AGENT.md`；本文件记录**在本机用真实 Obsidian + CLI 做端到端验证**的方法。

## 1. 环境

| 项 | 值 |
| --- | --- |
| Obsidian（Linux 版，WSLg 下运行） | `/opt/Obsidian/obsidian` |
| CLI | `obsidian`（`~/.local/bin/obsidian`），只能连 Linux 版 Obsidian；报 "unable to find Obsidian" 表示 Linux 版没启动 |
| 测试库 | `plugins_test`（库名 `plugins_test`，Linux 版唯一注册的库） |
| 测试库已装插件 | `gantt-calendar`、`notebook-navigator`（从 Academic 库复制的 3.4.3 代码，不含其 data.json）、`timeline-for-bases`、claudian、`obsidian-day-planner`（0.35.1，仅作 ICS 订阅等行为的参照实现）、`dataview`（0.5.68，任务查询框的 `TASK …` 查询依赖它） |
| Emoji 字体 | Linux 版默认没有 emoji 字体，已在用户目录装 Noto Color Emoji（见 §5） |

启动并等 CLI 可用（约 10 秒）：

```bash
nohup /opt/Obsidian/obsidian > /tmp/obsidian.log 2>&1 &
for i in $(seq 1 30); do obsidian version >/dev/null 2>&1 && break; sleep 1; done
```

默认窗口只有 1024×800，月视图格子会被裁切。先放大：

```bash
obsidian eval code="require('@electron/remote').getCurrentWindow().setSize(1600,1000)"
```

第一次启用 Notebook Navigator 会弹欢迎框，点掉：

```bash
obsidian eval code="[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Maybe later').forEach(b=>b.click())"
```

## 2. gantt-calendar 构建 → 部署 → 重载

```bash
cd obsidian-gantt-calendar
npm ci --registry=https://registry.npmmirror.com/   # 首次；lockfile 的 resolved 指向 npmmirror，用默认源会报 EALLOWREMOTE
npm run postinstall                                 # 新版 npm 会拦截 install script，需手动跑一次
npx jest                                            # 单元测试
npx eslint .                                        # 0 error 才算通过
npm run build                                       # tsc + esbuild，产物 main.js / styles.css（不会自动同步到库）
cp main.js manifest.json styles.css ../plugins_test/.obsidian/plugins/gantt-calendar/
obsidian plugin:reload id=gantt-calendar
obsidian dev:errors                                 # 必须是 "No errors captured."
```

## 3. 驱动 UI

```bash
# 打开主视图
obsidian command id=gantt-calendar:open-calendar-view
# 切换视图：Day | Week | Month | Year | Tasks | Gantt（工具栏按钮；不要用全局 button 查找，移动端 Dock 里有同名隐藏按钮）
obsidian eval code="[...document.querySelectorAll('.gc-toolbar__view-selector-btn')].find(b=>b.textContent.trim()==='Week').click()"
# 截图后用图片查看工具检查
obsidian dev:screenshot path=/path/to/shot.png
# 读插件内部状态
obsidian eval code="JSON.stringify(app.plugins.plugins['gantt-calendar'].taskCache.getAllTasks().map(t=>t.description))"
# 改设置后刷新视图
obsidian eval code="(async()=>{const p=app.plugins.plugins['gantt-calendar'];p.settings.fileTaskViews.month.groupTasks=true;await p.saveSettings();p.refreshCalendarViews()})()"
```

交互模拟（React 监听原生事件，`dispatchEvent` 即可触发）：

- **单击 / 双击**：对 `.gc-task-card__text` 依次派发 `click`、`click`、`dblclick`（`new MouseEvent(type,{bubbles:true})`），然后查 `.modal-container` 或截图确认编辑面板。
- **甘特拖拽**：取 `[data-task-bar="<id>"] .task-bar` 的中心点，在条上派发 `pointerdown`，在 `activeDocument` 上派发若干 `pointermove` 与最终 `pointerup`（列宽 40px = 1 天），等 ~800ms 后 `app.vault.read()` 读回文件核对写回内容。文件行的 id 为 `file:<路径>`。
- **悬浮展开卡片**：`document.querySelector('[data-file-task="<路径>"]').click()`。

设置页在 Obsidian 1.14 中是**独立窗口**，DOM 不在主窗口 `document` 里：

```bash
obsidian eval code="(async()=>{app.setting.open();app.setting.openTabById('gantt-calendar');await new Promise(r=>setTimeout(r,600));const d=app.setting.win.document;[...d.querySelectorAll('.setting-item')].find(e=>e.querySelector('.setting-item-name')?.textContent==='Views')?.click();await new Promise(r=>setTimeout(r,800));return JSON.stringify([...d.querySelectorAll('.setting-item-name')].map(e=>e.textContent))})()"
# 设置窗口截图
obsidian eval code="(async()=>{const w=require('@electron/remote').BrowserWindow.getAllWindows().find(x=>x.getTitle().startsWith('Settings'));require('fs').writeFileSync('/path/to/settings.png',(await w.webContents.capturePage()).toPNG())})()"
obsidian eval code="app.setting.close()"
```

### 3.1 UI 改动必做：遮挡 / 渲染检查

凡改动日/周/月视图、侧边栏时间线里的卡片、时间块、横条、标签、时刻标签（含新增卡片类型，如 ICS 事件卡），**交付前必须在真实 Obsidian 里实际看过渲染结果**，不能只看类型检查和单测通过。时间块右上角有时刻标签（约 14px 高 × 80px 宽，仅 ≥30 分钟的块显示），最容易被遮挡。

1. **构造覆盖各种尺寸的样例**：时长 15 / 30 / 60 / 180 分钟、带地点/标签/长标题、同时段多事件造成的窄 lane；周视图、日视图、侧边栏、月视图各看一遍；有文字的地方都要放进最坏情况（长标题、最窄 lane）。
2. **截图并肉眼检查**：`obsidian dev:screenshot` 后用图片工具看，逐项确认：文字没被时刻标签/边框/相邻块压住；没有被裁掉半行（上下被切）；省略号与换行符合预期；颜色/背景/边框正常；块外没有溢出；窗口 1600×1000 与较窄（约 1100 宽）都看。
3. **跑脚本判定遮挡**（用 DOM 矩形求交，截图之外的客观证据）：

   ```bash
   obsidian eval code="$(cat tools/check-timeblock-overlap.js)"   # 期望 {"overlaps":[]}
   ```

   脚本检查每个时间块的时刻标签与块内文字元素（`.gc-task-card__text`、`.gc-ics-event__title/location`）是否相交；新增了别的文字元素就把选择器补进脚本。

   再跑一遍「文字被挤成窄条 / 被裁切」检查（卡片允许换行时，文字 flex 基准为 0，空间不够会被挤成逐字换行）；**每个视图都要切过去各跑一次**（Day / Week / Month / Tasks，并打开文件卡悬浮窗）：

   ```bash
   obsidian eval code="$(cat tools/check-squeezed-text.js)"   # 期望 "squeezed":[]
   ```
4. **全局一致性**：改一个组件/数据/样式前，先 `grep` 找出它的所有使用方与变体，改完在**每个使用场景**里都看一遍，而不是只看触发问题的那一处。任务卡片至少覆盖：任务视图（宽）、文件卡悬浮窗（窄）、日视图全天区、月/周视图格内与时间块、侧边栏任务列表与每日时间线、悬浮提示、甘特左侧列表；数据层改动（如标签去重、筛选符识别）要在解析入口一处修，让所有消费方自动一致，避免在显示层各自打补丁。同一列表内同类元素的版式必须一致（如标签要么都在文字下方，要么都与文字同行），可跑 `tools/check-card-layout.js`（期望 `"mixed":[]` 与 `"duplicateTags":[]`）。
5. 发现遮挡或渲染问题就修到消失再交付；不要用“把标签隐藏”之类的绕过方式掩盖，除非用户同意。汇报时写明看了哪些视图/尺寸、脚本结果，没验证到的明确说没验证。

## 4. gantt-calendar 测试夹具（`plugins_test/GC QA/`）

插件 data.json 中 `globalTaskFilter` 当前为 `#task`（解析任务行需带它；夹具/临时笔记里的任务行要写 `#task`，空值时才不需要）、`fileTaskFolder` 为 `GC QA`、`dailyNoteSource` 为 `notebook-navigator`，file-based task 两个引入来源（`fileTaskIncludeDated` / `fileTaskIncludeTaskFiles`）都开启、`fileTaskExcludeDailyNotes` 开启。
Notebook Navigator 已配置：集成模式 `notebook-navigator`，根文件夹 `GC QA/Journal`，日记模式 `[Daily]/YYYY-MM-DD`。

| 文件 | 覆盖的功能 |
| --- | --- |
| `Inline tasks.md` | 仅 ⏳ 的任务（全天 / `09:00 - 10:30` 区间前缀 / `14:00` 单时刻前缀）、`#project-x #📌 #a/b-c` 标签过滤、`[[Alpha#目标]]` `[[Design\|设计稿]]` 双链渲染、⏳+📅 时以 📅 为准；「月视图撑高 A–D」同日多任务；「起止带时刻」「起止仅日期」同时带 🛫/📅、⏳ 和行首时间前缀 |
| `Projects/Alpha/Alpha.md` | folder note（项目链接目标） |
| `Projects/Alpha/Design.md`、`Build.md` | file-based task，`project: "[[Alpha\|Alpha 项目]]"` / `"[[Alpha]]"`；内含带时间与不带时间的任务；Design 带 `tags: project/alpha`（标签过滤用） |
| `Loose doc.md` | 没有 project 的 file-based task（应排在甘特文件分区底部） |
| `Journal/Daily/2026-10-19.md` | Notebook Navigator 规则下的日记（日视图右侧应嵌入它）；含一个任务，用于验证「排除每日笔记」 |

验收清单：

1. 月/周/日视图：仅 ⏳ 的任务出现在计划日期；带前缀的出现在对应时段，卡片文字不显示时间前缀；任务文字不含标签；双链显示为 "Alpha > 目标"、"设计稿"。
2. 拖动带前缀的任务（周视图时间块或甘特条）后，文件里只改 ⏳ 和行首时间前缀，不新增 🛫/📅；单时刻前缀平移后仍是单时刻。
3. 日视图右侧标题为 `2026-10-19`，内容来自 `GC QA/Journal/Daily/2026-10-19.md`。
4. 月/周/日视图出现紫色文件横跨条，单击弹出悬浮卡片（项目名、日期范围、文件内任务），双击打开文件；开启"按文件归类"后文件内任务从日历收起，周/日视图中带时间的任务仍在时间轴上。
5. 甘特图：上方「文件时间轴」按项目分组（项目名为可点击链接，显示别名而非 `[[...]]`），无项目文件在分区底部；下方「任务时间轴」；开启归类后任务缩进到所属文件行下。拖动文件条后 frontmatter 的 start/end 被改写。
   - 归类任务行比普通行矮（28px 行 / 16px 条）；有归类任务的文件行前有折叠按钮（`.gc-gantt-view__collapse-toggle`，派发 `click` 即可），折叠后行内显示收起数量，`settings.ganttCollapsedFileTasks` 记录折叠的文件，横向滚动位置不变。
6. 双击任务卡片/甘特条默认弹出编辑面板，编辑面板显示任务行的真实字段（仅 ⏳ 的任务 Start/Due 为空）。
7. 月视图：行高自适应（内容多的周行更高；窗口缩到 1100×700 时 `.gc-view--month` 的 `scrollHeight > clientHeight` 并出现纵向滚动条）；横跨条与单日任务混排在同一套 lane（`.gc-month-view__span-bar`，单日任务带 `--day` 修饰），单日任务紧贴其列上方空出的 lane（如 19–21 日的任务紧挨 Design 条下方），同一天的任务全部显示，没有 "+N more"。
8. 年视图：打开或切换年份后，当前月卡片（`[data-month="<月>"]`）在可视区内。
9. 同时带 🛫/📅 的任务按起止显示，⏳ 与行首时间前缀不参与定位：「起止带时刻」在周视图 20 日 09:00–11:00（块 `top:450px; height:100px`），「起止仅日期」在月视图为 23–24 日横跨条。
10. file-based task 引入来源（设置 → Tasks → File-based tasks，用 `Object.assign(p.settings, {...})` + `saveSettings()` 切换后看甘特文件行 `[data-task-row^="file:"]`）：
    - 只开「带日期属性」+ 标签过滤 `#Project` → 只有 Design.md（大小写不敏感，`project` 命中 `project/alpha`）。
    - 只开「含任务」→ Design、Build、Inline tasks、Loose doc；`Inline tasks.md` 没有日期属性，范围取其任务 🛫/⏳/📅 的最早到最晚，悬浮卡片显示 "Dates from tasks"；日记 `2026-10-19.md` 被排除，关闭「排除每日笔记」后出现。
    - 拖动日期来自任务的文件条 → 写入 start/end 属性，提示 "Saved the range to the note properties"。

## 5. ICS 订阅测试（设置 → ICS）

ICS 事件是**只读、仅内存**的（参考 Day Planner）：`IcsService` 拉取后推入 `calendarStore.icsEvents`，日/周/月视图与侧边栏每日时间线渲染为 `[data-ics-event]`，不写任何笔记。配置在 `settings.syncConfiguration.ics`（`subscriptions[]: {id,name,url,color,enabled}` + `syncInterval`）。

用本地 HTTP 服务当订阅源，不要把带令牌的私有订阅链接写进仓库、AGENTS.md 或测试夹具：

```bash
# 在一个临时目录放 t.ics（含定时 / 全天 / RRULE 事件），起服务（用 setsid，shell 退出后不被带走）
cd <临时目录> && setsid nohup python3 -m http.server 8765 >/dev/null 2>&1 < /dev/null &
obsidian eval code="(async()=>{const p=app.plugins.plugins['gantt-calendar'];p.settings.syncConfiguration.ics={subscriptions:[{id:'t',name:'Test',url:'http://localhost:8765/t.ics',color:'#e5484d',enabled:true}],syncInterval:0};await p.saveSettings();await p.icsService.refresh();})()"
obsidian eval code="JSON.stringify([...document.querySelectorAll('[data-ics-event]')].map(e=>e.title))"
```

验收要点：

1. 定时事件出现在周/日视图时间轴与侧边栏，全天/多日事件是横条，颜色取订阅色；卡片无勾选框、无拖动/缩放手柄、无右键菜单。
2. 拉取失败（关掉服务后 `icsService.refresh()`）：事件仍在（沿用上次成功内容），并弹失败提示。
3. 时区：`TZID` 为 IANA 名或 Outlook 的 Windows 名（如 `China Standard Time`）都应换算正确；未收录的 Windows 时区名会退化为本机时区。
4. 测完把订阅清掉（`ics={subscriptions:[],syncInterval:0}` 再 `saveSettings()`）：测试库 `data.json` 会保存订阅地址，私有链接等同于读权限，别留在里面，也别把该文件复制回真实库。

## 5.1 Dataview 任务查询测试（工具栏 Filter → Task → 任务查询）

查询框内容以 `TASK` 开头时整段交给 Dataview 执行（Tasks 语法行不以 TASK 开头）。Dataview 的 `line` 从 0 起，插件任务行号从 1 起，匹配键为 `路径:行号`。

```bash
# 直接探 Dataview 返回
obsidian eval code="(async()=>{const r=await app.plugins.plugins['dataview'].api.query('TASK FROM \"GC QA\" WHERE !completed');return JSON.stringify(r.value.values.map(t=>[t.path,t.line,t.text]))})()"
# 设置筛选框内容（React 受控 textarea 要用原生 setter + input 事件），再读视图里的卡片
obsidian eval code="(async()=>{const all=[...document.querySelectorAll('[class*=filter-panel] textarea')];const t=all[all.length-1];Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'TASK WHERE !completed');t.dispatchEvent(new Event('input',{bubbles:true}))})()"
```

验收要点：命中任务才显示；`GROUP BY` 也能用；语法错误 / `LIST` 等非 TASK 查询在面板里报错且不过滤；停用 Dataview 后报“未安装或未启用”；Tasks 语法仍可用。任务视图和侧边栏任务列表是各自的筛选作用域，改一个不影响另一个。测完点 Filter 面板的 Reset 清掉持久化的筛选。

## 6. 已知问题与注意事项

- **启动扫描竞态**：Obsidian 关闭期间在磁盘上新建/修改的笔记，启动后首扫时 metadataCache 尚未索引，其中的任务会漏掉，直到文件再次变动。造夹具后可对每个文件调用 `app.plugins.plugins['gantt-calendar'].taskCache.refreshFile(path)`，或重载插件。
- 任务行需带全局筛选符 `#task`，位置不限（行首 / 时间前缀之后 / 行尾都识别；`#task/xxx` 子标签也算，`#tasks`、`a#task` 不算）。构造夹具时 `09:00 - 10:30 #task 内容`、`#task/work 内容` 都是合法写法。
- Linux 版缺少 emoji 字体时，优先级/日期 emoji 在截图里显示为方框，不是插件问题。无 root 的修复：`apt-get download fonts-noto-color-emoji`，`dpkg -x` 解出 `NotoColorEmoji.ttf` 放进 `~/.local/share/fonts/`，`fc-cache -f` 后**重启 Obsidian**。重装环境后需重做。
- 测试 ICS 订阅时，Electron 会按 `Last-Modified` 做启发式缓存，同一地址反复改内容可能拿到旧数据；插件请求已带 `Cache-Control: no-cache`，自测换内容后若仍是旧的，先确认已重载最新构建。
- `pkill -f "<pattern>"` 会匹配到 Bash 工具自己的命令行并把它杀掉（退出码 144）；停进程用 `fuser -k <端口>/tcp` 或 `pkill -x <进程名>`。
- `obsidian eval` 中不能 `require('obsidian')`；插件内部函数无法直接调用，通过插件实例（`app.plugins.plugins[id]`）或 DOM 交互验证。
- 改设置会写入 `plugins_test/.obsidian/plugins/<id>/data.json`，测试结束不需要还原，但别把测试库数据复制回真实库。
