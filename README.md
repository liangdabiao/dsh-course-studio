# dsh-course-studio · 课程工坊

基于 [Mathigon](https://mathigon.org) 交互教科书方法论的 dsh 插件：**用户提课程需求 → agent 按 skill 在本地 Mathigon 仓库创作互动课件 → 编译校验 → 存证入档 → 面板预览真实渲染的课件**。课件档案持久化，可随时回看源码与真实效果。
<img width="1737" height="951" alt="image" src="https://github.com/user-attachments/assets/066c42db-9ad8-4f69-b6ec-400e1199d4d6" />
<img width="1767" height="1032" alt="image" src="https://github.com/user-attachments/assets/85178f87-83b1-4fa7-beb2-420f491a334e" />

## 它解决什么问题

Mathigon 是公认最高质量的互动教科书之一（双栏排版、填空即测、x-geopad/x-slider 互动组件、虚拟导师）。本插件把「做出同等质量的课件」变成一条 agent 闭环：

```
提需求（面板一句话 → 一键开新对话发起）
   ↓
agent 按 course-studio 技能创作（先读 references，参照仓库真实课程）
   ↓  写 content/<slug>/content.md + functions.ts + styles.scss
course_studio lint → build（抓 Maths parsing error / 缺 glossary key）
   ↓
course_studio save（源文件存证入档，面板可回看）
   ↓
course_studio serve（mgon-serve）→ 面板「课件预览」看真实渲染的课件
```

## 安装

```
dsh plugin --profile web add https://github.com/liangdabiao/dsh-course-studio
```

前置：本地有一个 Mathigon  textbooks 仓库（含 `content/` 与 `package.json`，依赖已 `npm install`）。默认路径 `D:\textbooks-master`，可在插件 Config 改（课程仓库路径 / 预览端口）。

## 面板（侧栏「课程工坊」）

| 页签 | 内容 |
|---|---|
| 概览 | 统计卡片 + 环境（仓库/依赖/预览服务状态）+ 最近课件 |
| 发起制作 | **一句话提需求**（学科/学段/互动方式 agent 自行判断）→ 一键在新对话发起；附 3 个示例点填 |
| 课件档案 | 存证卡片（标题/学科/校验状态/版本数），源码回看，删除可恢复 |
| 课件预览 | **真实课件 iframe**（本地 mgon-serve 渲染的学生视角页），可切 section、一键启动预览服务、新窗口打开 |
| 档案历史 | 新建/更新/删除/恢复全留痕，删除带快照可恢复 |
| 制作规范 | course-studio 技能要点速查（中文课件硬规则、交付闭环） |

## 工具：course_studio

| action | 说明 |
|---|---|
| `list` | 盘点仓库课程（找参照、避免 slug 撞名） |
| `check` | 环境自检（仓库 / node_modules / 预览服务） |
| `get` | 取一门课的 section 清单（核对 section 齐全性） |
| `lint` | eslint 自动修 + 校验 content/\*\*/\*.ts |
| `build` | mgon-build 全仓库编译，结构化返回 Maths parsing error / Missing keys |
| `save` | 课件存证（源文件复制入档案库；同 slug+locale 自动走更新多一版） |
| `serve` | 启动/确认本地预览服务，返回预览 URL |
| `archive` / `get-archive` / `delete` / `history` / `restore` | 档案管理 |

## 技能快照：course-studio

完整快照自 Mathigon 课件创作方法论（写 `content.md` 前读 `markdown-dialect.md`；写 `functions.ts` 读 `functions-model.md`；互动组件读 `components.md`；**中文课件必读 `chinese-localization.md`**）。

三条最常见的「静默翻车」红线（构建不报错但课件缺节）：

1. **step 之间必须 `---` 分隔**——不写整份文件被当成一个 step，前面的 section 全部静默丢失（实测踩过）；
2. 中文课件每个 section 必须显式 `> section: <英文slug>`；
3. backtick 公式里严禁中文（AsciiMath Unknown symbol）。

## 档案存储

`$DSH_HOME/dsh-course-studio/`（默认 `~/.dsh/dsh-course-studio/`）：

```
archives.json        档案元数据（每保存一版多一条 revision，最多 20 版）
history.json         事件流（删除带完整快照，可恢复）
courses/<id>/        源文件存证副本（content.md / functions.ts / styles.scss / hints.yaml / images…）
```

删除档案不影响仓库里的课程源文件；仓库原件丢失可从档案回看源码。

## 开发

```
npm install
npm run build        # 打包 client.js → dist/client.js
npm test             # lib 层单测（沙盒，28 项）
npm run check:start  # 「发起制作」发出的指令是否为完整指令（前缀 / 需求原文 / 闭环要求）
node scripts/smoke.mjs [--repo <仓库>] [--port <端口>]
                     # E2E 冒烟：工具全动作 + 真实课件页可达性（沙盒 DSH_HOME）
node scripts/panel-dev.mjs [--port 8899]
                     # 面板开发预览（假 ctx 拉起 api 路由，浏览器直接验收）
```

## 许可

MIT。注意：Mathigon 仓库内容本身 UNLICENSED / private——创作课件请遵守所在仓库的许可约定，勿直接搬运其内容商用。
