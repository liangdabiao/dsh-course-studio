---
name: course-studio
description: 基于 Mathigon 交互教科书方法论制作高质量 STEM 互动课件（content.md 自定义 Markdown + functions.ts 互动模型，双栏排版、填空检测、x-geopad/x-slider 等互动组件、虚拟导师提示）。用户提课程/课件需求（如「做一节勾股定理的互动课」「给高一学生做一个单摆实验课件」）时用本 skill：在本地 Mathigon 仓库创作课程 → 编译校验 → 课件存证 → 面板预览真实渲染效果。当用户要制作课件、互动课程、互动教材、网课页面、微课，或提到「课件」「课程」「Mathigon」「interactive textbook」「互动教科书」时使用。
---

# Mathigon 互动课件制作（课程工坊）

在本地 Mathigon 仓库（插件 Config「课程仓库路径」，默认 `D:\textbooks-master`）创作交互式 STEM 课程，
产出与 mathigon.org 同质量的课件：学生逐 step 推进、填空即测、互动组件探索、虚拟导师提示、进度与 goal 记分。

## 开工前（一次性，约 1 分钟）

1. `course_studio` 工具跑 **check**：确认仓库/依赖/预览服务状态（依赖缺了让用户 `npm install`，不要自己动手装）。
2. `course_studio` 工具跑 **list**：盘点现有课程——**找一门最接近的作为参照**，并确保新课 slug 不撞名。
3. 把技能目录复制到当前工作区（bash 沙箱读不到插件安装目录）：
   ```bash
   cp -r "<本技能目录>" ./course-studio-skill
   ```

## 制作流程

### 阶段一：教学定位 + 读参考（先读后写，别凭记忆写 API）

| 要做什么 | 写代码前必读 |
|---|---|
| 写/改 `content.md`（排版、填空、公式、链接、revel） | `references/markdown-dialect.md` |
| 写 `functions.ts` step 处理器、score goals、驱动填空、做动画 | `references/functions-model.md` |
| 用 `x-geopad` / `x-slider` / `x-equation` / `x-coordinate-system` 等互动组件 | `references/components.md` **和** `functions-model.md` |
| 调 @mathigon 工具（Point, Random, animate, slide, $, $N…） | `references/libraries.md` |
| **写中文课件** | `references/chinese-localization.md`（**必读**，CJK 有隐性规则） |
| 构建/服务/config | `references/build-and-config.md` |

参照真实课程：`circles`、`euclidean-geometry`、`graph-theory`、`probability` 最丰富。
打开参照课的 `content.md` + `functions.ts`，抄 import 块、section 结构、组件用法。

### 阶段二：创作（三件套）

在仓库 `content/<slug>/` 下建课程目录（slug 用英文 kebab-case，如 `tanzhao-pythagoras`），写：

```
content/<slug>/
├── content.md      ← 课程源（自定义 Markdown 方言）
├── functions.ts    ← 互动步骤的 TypeScript（可选，纯内容课可省）
├── styles.scss     ← 课程专属样式（可选）
└── hints.yaml      ← 虚拟导师提示（可选）
```

**核心心智模型**：课程 = 一串 step。`content.md` 里 `> id:` 声明的 step 与 `functions.ts` 里
camelCase 命名的导出函数机械对应；step 的 `> goals:` 全部得分才解锁「下一步」；
正文里的 `[[...]]` 填空自动生成 goal。

**中文课件硬规则**（详见 chinese-localization.md，违反必挂）：
- **step 之间必须用 `---` 分隔**（三个横杠 = 新 step）——不写分隔线整份文件会被当成一个 step，
  前面的 section 全部静默丢失（构建不报错！用 `course_studio get` 核对 section 数）；
- 每个 section 必须显式 `> section: <英文slug>`——中文 H2 无法 slugify，否则只有第一节可见；
- backtick 公式里**严禁中文**（AsciiMath 报 Unknown symbol），中文放 backtick 外；
- `> id:` / `> section:` / `gloss:` / `bio:` key 全英文；正文、填空选项、hints 用中文；
- 数学/几何的每个长度、角度、坐标**必须实算验证**（不要目测——错图比没图更糟）。

### 阶段三：校验闭环（工具做，不要手工绕过）

```bash
# 工具内部跑的就是这两条，你直接用工具：
course_studio lint    # eslint 自动修 + 校验 content/**/*.ts
course_studio build   # mgon-build 全仓库编译，抓 Maths parsing error / Missing glossary|bios keys
```

- **零 Maths parsing error、零 error 才算过**。警告（如缺 glossary key）能修就修。
- section 齐全性自查：`course_studio get slug=<你的slug>` 确认 sections 数量与 content.md 一致。

### 阶段四：存证 + 预览交付

1. `course_studio save`（slug + subject + grade + goal + note，build 过了传 buildOk=true）
   ——源文件复制进档案库，用户可在侧栏「课程工坊」→ 课件档案永久回看。
2. `course_studio serve` 启动本地预览服务（mgon-serve）。
3. 告知用户：去侧栏「课程工坊」→ 选这门课 → **预览**，能看到真实渲染的课件（学生视角）。
4. 如果用户要改：直接改仓库里的课程文件，重跑 lint/build，再 `save`（同 slug 传 id 覆盖会多一版历史）。

## 质量红线（全部通过才算完成）

- [ ] step 之间有 `---` 分隔线；`course_studio get` 核对 section 数量与预期一致（分隔线缺失会静默丢节）
- [ ] 每个 section 有显式 `> section:`（中文课件）；`> id:` 全英文
- [ ] backtick 里无中文；Unicode 分数（½¼²）写成 ASCII（1/2、^2）
- [ ] gloss/bio 链接的 key 在 `content/shared/glossary.yaml` / `bios.yaml` 里存在（否则改纯文本）
- [ ] 数学坐标/长度实算验证过
- [ ] `course_studio build` 零 error；`get` 确认 sections 齐全
- [ ] `course_studio save` 已存证（面板可见）+ `serve` 已启动（可预览）
