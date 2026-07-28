---
name: ui-to-drawio
description: >
  将界面功能描述转换为 drawio 原型图和 PNG 图像文件。
  工作流：文本描述 → JSON 界面描述 → drawio 文件 + PNG 图像 → Review 审查与修订（需求覆盖、业界对比、按建议改图）。
  使用 Ant Design Pro 视觉风格（深蓝侧边栏 #001529、白色顶栏、浅灰背景 #F0F2F5）。
  当用户提供界面功能描述、页面需求说明、PRD 中的页面描述，或要求
  「生成界面原型」「把功能说明转成原型图」「画出这个页面」「生成界面设计图」
  「做界面mockup」「功能描述转界面图」时务必使用此技能。
---

# UI-to-Drawio — 界面功能描述转原型图生成器

将用户用自然语言描述的界面功能，经过 JSON 结构化描述，最终生成 drawio 文件和对应的 PNG 图像。

## 工作流

```
用户输入（界面功能描述/页面需求）
  ↓
第〇步：分页 → 检测描述中是否包含多个页面，拆分页面列表
  ↓
第一步：分析 → 对每个页面，提取页面类型、布局模式、组件清单
  ↓
第二步：结构化 → 对每个页面，生成标准 JSON 界面描述（详见 references/json-schema.md）
  ↓
第三步：绘制 → 根据各页面 JSON 生成 mxGraphModel XML → 合并写入 .drawio 文件
  ↓
第四步：检测 → 调用 check-overlap.py 检测组件重叠，如有重叠则修正后重新检查
  ↓
第五步：导出 → 调用 drawio CLI 导出每页 PNG（与 .drawio 并存）→ 此为「初版」
  ↓
第六步：Review 修订 ────────────────────────────────────────────┐
  ├─ 通道一：XML 自检（读回 XML → 对齐/间距/字号/颜色/尺寸/边界）  │
  ├─ 通道二：需求覆盖审查（逐项对照 → 已覆盖/未覆盖/P0-P1 标注）   ├─→ 修订清单
  ├─ 通道三：交互状态完整性（空态/加载/失败/成功标签页补全）        │
  ├─ 通道四：业界设计对比（维度 → 业界惯例 → 差异 → 修订方案）     │
  └─ 通道五：按 P0/P1 优先级执行修订 → 再检测 → 再导出            │
  ↓                                                              │
输出：xxx.drawio + xxx-N.drawio.png + Review 修订摘要 ←──────────┘
```

**重要**：第五步导出的是「初版」；**必须完成第六步 Review 修订后**才可视为交付完成。不得跳过 Review 直接结束。Review 的五个通道（XML 自检 → 需求覆盖 → 状态完整性 → 业界对比 → 修订执行）必须全部走完。

### 第〇步：多页面检测

在分析之前，先检查用户描述中是否包含多个独立页面。

**多页面识别规则**：

| 信号 | 说明 |
|------|------|
| 明确的页面分隔标记 | "页面1 / 页面2"、"第一页"、"其次是"、"然后是" |
| 多个 pageId / route | JSON 结构中包含多个页面对象 |
| 不同页面类型连续描述 | "列表页...详情页...编辑页" |
| 流程中的步骤页 | "从 A 页面点击后进入 B 页面" |

**拆分策略**：
- 多个独立页面 → 每个页面一个 `<diagram>` 标签页
- 单一页面 → 直接使用 `<mxGraphModel>` 单页格式
- 每个页面取独立标题作为标签页名称

## 第一步：分析界面功能描述

从用户提供的自然语言描述中提取以下信息：

### 1.1 页面类型识别

| 关键词 | 页面类型 | 典型特征 |
|--------|---------|---------|
| 登录、注册、登入、Sign in、注册账号 | `login` | 居中卡片、Logo、输入框、按钮 |
| Dashboard、工作台、仪表盘、分析页、监控、统计 | `dashboard` | 统计卡片 + 图表区域 + 列表 |
| 列表、查询、搜索、表格、数据展示 | `table` | 搜索栏 + 操作按钮 + 表格 + 分页 |
| 表单、录入、新建、编辑、提交、填写 | `form` | 表单字段 + 提交按钮、可能有步骤条 |
| 异常、403、404、500、错误、无权限 | `exception` | 错误图示 + 提示文字 + 返回按钮 |
| 通知、消息、提醒、公告 | `notification` | 列表/卡片式通知展示 |
| 其他 | `general` | 通用内容卡片布局 |

### 1.2 布局模式识别

| 描述 | 布局模式 | 特征 |
|------|---------|------|
| 左侧菜单、侧边栏、左边导航 | `side-menu` | 左侧深色竖栏 200px + 右侧内容区 |
| 顶部菜单、顶部导航、上方菜单 | `top-menu` | 顶部深色横栏 48px + 下方内容区 |
| 混合菜单、左侧+顶部 | `mixed-menu` | 顶部一级菜单 + 左侧二级菜单 |
| 居中、居中卡片、登录布局 | `centered` | 全屏浅灰背景 + 居中白色卡片 |

### 1.3 组件提取

从描述中识别所有 UI 组件并确定其属性：

- **按钮**：文字、类型（主色/次色/危险）、位置暗示
- **输入框**：标签、占位符、宽度暗示（短/中/长）
- **选择器**：标签、选项
- **表格**：列数、大致行数、是否有分页
- **卡片**：标题、内容描述
- **统计卡片**：图标暗示、标签、数值
- **标签/徽标**：文字、颜色暗示（成功/警告/错误/信息）
- **步骤条**：步骤数
- **搜索栏**：筛选项数量
- **图表**：类型暗示（折线/柱状/饼图）
- **菜单项**：名称、图标暗示、层级关系
- **面包屑**：路径

## 第二步：生成 JSON 界面描述

根据第一步的分析结果，生成标准 JSON 描述文件。具体 schema 定义见 `references/json-schema.md`。

### 2.1 JSON 结构概览

```json
{
  "meta": { "pageType": "...", "theme": "...", "layout": "...", "title": "..." },
  "canvas": { "width": 1440, "height": 800, "background": "#F0F2F5" },
  "regions": { "sidebar": {...}, "header": {...}, "content": {...} },
  "sidebar": { "logo": {...}, "menuItems": [...] },
  "header": { "breadcrumb": [...], "actions": [...] },
  "content": { "components": [...] }
}
```

### 2.2 布局坐标计算规则

**侧边菜单布局 (side-menu)**：
```
regions.sidebar  = { x: 0,   y: 0,   w: 200, h: 800, fill: "#001529" }
regions.header   = { x: 200, y: 0,   w: 1240, h: 48,  fill: "#FFFFFF" }
regions.content  = { x: 200, y: 48,  w: 1240, h: 752 }
content组件原点  = (200 + 24, 48 + 24) = (224, 72)
```

**顶部菜单布局 (top-menu)**：
```
regions.sidebar  = { visible: false }
regions.header   = { x: 0,   y: 0,   w: 1440, h: 48,  fill: "#001529" }
regions.content  = { x: 0,   y: 48,  w: 1440, h: 752 }
content组件原点  = (24, 72)
```

**混合菜单布局 (mixed-menu)**：
```
regions.sidebar  = { x: 0,   y: 48,  w: 200, h: 752, fill: "#FFFFFF" }
regions.header   = { x: 0,   y: 0,   w: 1440, h: 48,  fill: "#001529" }
regions.content  = { x: 200, y: 48,  w: 1240, h: 752 }
content组件原点  = (224, 72)
```

**居中布局 (centered / 登录页)**：
```
regions.sidebar  = { visible: false }
regions.header   = { visible: false }
regions.content  = { x: 0,   y: 0,   w: 1440, h: 800 }
登录卡片          = { x: 530, y: 180, w: 380, h: 440 }
```

### 2.3 组件坐标计算

所有组件的坐标都是相对于画布的绝对坐标。使用以下规则计算：

1. **卡片内组件**：x = 卡片x + 24, y = 卡片y + 标题区高度(40) + 累加偏移
2. **统计卡片**：水平等分 content 可用宽度，间距 16px
3. **表格**：宽度 = 卡片宽度 - 48 (24px 左右内边距)
4. **按钮组**：右对齐在卡片内，x = 卡片右边界 - 24 - 按钮总宽
5. **垂直间距**：组件间 16px，标签组间 24px

### 2.4 颜色参考

从参考图像中提取的 Ant Design Pro 色彩系统：

| 元素 | 填充色 | 描边色 | 文字色 |
|------|--------|--------|--------|
| 侧边栏 | `#001529` | `#001529` | `#A6A6A6` (非激活) / `#FFFFFF` (激活) |
| 侧边栏选中项 | `#1890FF` | `#1890FF` | `#FFFFFF` |
| 顶栏(侧边布局/亮色) | `#FFFFFF` | `#F0F0F0` | `#262626` |
| 顶栏(顶部布局/暗色) | `#001529` | `#001529` | `#FFFFFF` |
| 页面背景 | `#F0F2F5` | — | — |
| 卡片 | `#FFFFFF` | `#F0F0F0` | `#262626` (标题) |
| 按钮主色 | `#1890FF` | `#1890FF` | `#FFFFFF` |
| 按钮次色 | `#FFFFFF` | `#D9D9D9` | `#262626` |
| 按钮危险 | `#FF4D4F` | `#FF4D4F` | `#FFFFFF` |
| 输入框 | `#FFFFFF` | `#D9D9D9` | `#262626` |
| 表格表头 | `#FAFAFA` | `#F0F0F0` | `#262626` |
| 表格行 | `#FFFFFF` | `#F0F0F0` | `#595959` |
| 标签(Tag)蓝 | `#E6F7FF` | `#91D5FF` | `#1890FF` |
| 标签(Tag)绿 | `#F6FFED` | `#B7EB8F` | `#52C41A` |
| 标签(Tag)红 | `#FFF1F0` | `#FFA39E` | `#FF4D4F` |
| 标签(Tag)橙 | `#FFF7E6` | `#FFD591` | `#FAAD14` |
| 分隔线 | — | `#F0F0F0` | — |

## 第三步：生成 Drawio 文件

根据第二步的 JSON 描述，逐组件生成 drawio mxCell XML。

### 3.1 Drawio XML 基本框架

```xml
<mxGraphModel dx="1440" dy="800" grid="1" gridSize="10" guides="1" tooltips="1"
  connect="1" arrows="1" fold="1" page="1" pageScale="1"
  pageWidth="1440" pageHeight="800" background="#F0F2F5">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <!-- 所有可见元素 -->
  </root>
</mxGraphModel>
```

### 3.1.1 多页面 XML 格式

当检测到多个页面时，使用 `<mxfile>` 包裹多个 `<diagram>` 标签：

```xml
<mxfile host="drawio" modified="2026-01-01T00:00:00.000Z" agent="ui-to-drawio" version="21.0.0" type="device">
  <diagram id="page-1" name="审理任务列表页">
    <mxGraphModel dx="1440" dy="900" grid="1" gridSize="10" guides="1" tooltips="1"
      connect="1" arrows="1" fold="1" page="1" pageScale="1"
      pageWidth="1440" pageHeight="900" background="#F0F2F5">
      <root>
        <mxCell id="p1-0"/>
        <mxCell id="p1-1" parent="p1-0"/>
        <!-- 页面 1 所有元素，parent="p1-1" -->
      </root>
    </mxGraphModel>
  </diagram>
  <diagram id="page-2" name="审理详情页">
    <mxGraphModel dx="1440" dy="900" grid="1" gridSize="10" guides="1" tooltips="1"
      connect="1" arrows="1" fold="1" page="1" pageScale="1"
      pageWidth="1440" pageHeight="900" background="#F0F2F5">
      <root>
        <mxCell id="p2-0"/>
        <mxCell id="p2-1" parent="p2-0"/>
        <!-- 页面 2 所有元素，parent="p2-1" -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

**多页面 ID 命名规则**：
- 每页使用独立的 ID 前缀避免跨页冲突：`p1-`、`p2-`、...
- root cell id 为 `pN-0`，默认图层 id 为 `pN-1`
- 所有元素 parent 指向对应页的 `pN-1`

**多页面导出规则**：
- 每页分别导出 PNG：`xxx-1.drawio.png`、`xxx-2.drawio.png`
- 使用 `-p` 参数指定页码（1-based）：`drawio -x -f png -p 1 -e -b 10 -o output-1.drawio.png output.drawio`

### 3.2 组件 → mxCell 映射表

每种 JSON 组件类型对应特定的 mxCell 结构。详见 `references/component-mapping.md`。

**通用矩形（区域背景/卡片）**：
```xml
<mxCell id="X" value="" style="rounded=1;whiteSpace=wrap;html=1;
  fillColor=#FFFFFF;strokeColor=#F0F0F0;arcSize=4;" vertex="1" parent="1">
  <mxGeometry x="224" y="72" width="1192" height="600" as="geometry"/>
</mxCell>
```

**按钮（主色）**：
```xml
<mxCell id="X" value="提交" style="rounded=1;whiteSpace=wrap;html=1;
  fillColor=#1890FF;strokeColor=#1890FF;fontColor=#FFFFFF;
  fontSize=12;arcSize=12;" vertex="1" parent="1">
  <mxGeometry x="100" y="200" width="80" height="32" as="geometry"/>
</mxCell>
```

**输入框**：
```xml
<mxCell id="X" value="请输入" style="rounded=1;whiteSpace=wrap;html=1;
  fillColor=#FFFFFF;strokeColor=#D9D9D9;fontColor=#BFBFBF;
  fontSize=12;arcSize=4;align=left;spacingLeft=8;" vertex="1" parent="1">
  <mxGeometry x="100" y="100" width="300" height="32" as="geometry"/>
</mxCell>
```

**文本标签**：
```xml
<mxCell id="X" value="用户名" style="text;html=1;strokeColor=none;
  fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;
  fontSize=13;fontColor=#262626;" vertex="1" parent="1">
  <mxGeometry x="100" y="80" width="120" height="20" as="geometry"/>
</mxCell>
```

**统计卡片**：
```xml
<mxCell id="X" value="" style="rounded=1;whiteSpace=wrap;html=1;
  fillColor=#FFFFFF;strokeColor=#F0F0F0;arcSize=4;" vertex="1" parent="1">
  <mxGeometry x="224" y="72" width="280" height="140" as="geometry"/>
</mxCell>
<!-- 图标（小圆） -->
<mxCell id="X_icon" value="" style="ellipse;whiteSpace=wrap;html=1;
  fillColor=#E6F7FF;strokeColor=#E6F7FF;" vertex="1" parent="1">
  <mxGeometry x="248" y="96" width="36" height="36" as="geometry"/>
</mxCell>
<!-- 数值 -->
<mxCell id="X_val" value="¥ 126,560" style="text;html=1;strokeColor=none;
  fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;
  fontSize=24;fontColor=#262626;fontStyle=1;" vertex="1" parent="1">
  <mxGeometry x="248" y="100" width="200" height="28" as="geometry"/>
</mxCell>
<!-- 标签 -->
<mxCell id="X_label" value="总销售额" style="text;html=1;strokeColor=none;
  fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;
  fontSize=12;fontColor=#8C8C8C;" vertex="1" parent="1">
  <mxGeometry x="248" y="130" width="200" height="18" as="geometry"/>
</mxCell>
```

**表格行**：
```xml
<!-- 表头 -->
<mxCell id="th" value="..." style="rounded=0;whiteSpace=wrap;html=1;
  fillColor=#FAFAFA;strokeColor=#F0F0F0;fontColor=#262626;
  fontSize=12;fontStyle=1;" vertex="1" parent="1">
  <mxGeometry x="248" y="200" width="1144" height="40" as="geometry"/>
</mxCell>
<!-- 数据行 -->
<mxCell id="tr1" value="..." style="rounded=0;whiteSpace=wrap;html=1;
  fillColor=#FFFFFF;strokeColor=#F0F0F0;fontColor=#595959;
  fontSize=12;" vertex="1" parent="1">
  <mxGeometry x="248" y="240" width="1144" height="40" as="geometry"/>
</mxCell>
```

**侧边栏菜单项**：
```xml
<!-- 普通菜单项 -->
<mxCell id="menu_1" value="Dashboard" style="rounded=0;whiteSpace=wrap;html=1;
  fillColor=#001529;strokeColor=#001529;fontColor=#A6A6A6;
  fontSize=13;align=left;spacingLeft=24;" vertex="1" parent="1">
  <mxGeometry x="0" y="64" width="200" height="40" as="geometry"/>
</mxCell>
<!-- 选中菜单项 -->
<mxCell id="menu_2" value="表单页" style="rounded=0;whiteSpace=wrap;html=1;
  fillColor=#1890FF;strokeColor=#1890FF;fontColor=#FFFFFF;
  fontSize=13;align=left;spacingLeft=24;" vertex="1" parent="1">
  <mxGeometry x="0" y="104" width="200" height="40" as="geometry"/>
</mxCell>
```

**面包屑**：
```xml
<mxCell id="bc" value="首页 / Dashboard / 分析页" style="text;html=1;
  strokeColor=none;fillColor=none;align=left;verticalAlign=middle;
  whiteSpace=wrap;rounded=0;fontSize=12;fontColor=#8C8C8C;" vertex="1" parent="1">
  <mxGeometry x="224" y="50" width="300" height="20" as="geometry"/>
</mxCell>
```

**分隔线**：
```xml
<mxCell id="div_1" value="" style="rounded=0;whiteSpace=wrap;html=1;
  fillColor=#F0F0F0;strokeColor=#F0F0F0;" vertex="1" parent="1">
  <mxGeometry x="224" y="300" width="1192" height="1" as="geometry"/>
</mxCell>
```

**步骤条 (Steps)**：
```xml
<!-- 步骤圆点 + 连接线 + 文字 -->
<mxCell id="step_1_dot" value="" style="ellipse;whiteSpace=wrap;html=1;
  fillColor=#1890FF;strokeColor=#1890FF;" vertex="1" parent="1">
  <mxGeometry x="300" y="100" width="24" height="24" as="geometry"/>
</mxCell>
<mxCell id="step_1_text" value="步骤一" style="text;html=1;strokeColor=none;
  fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;
  fontSize=12;fontColor=#262626;" vertex="1" parent="1">
  <mxGeometry x="278" y="128" width="68" height="18" as="geometry"/>
</mxCell>
```

**分页 (Pagination)**：
```xml
<mxCell id="pagination" value="共 100 条  &lt;  1  2  3  ...  10  &gt;  10条/页"
  style="text;html=1;strokeColor=none;fillColor=none;align=right;
  verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=12;
  fontColor=#595959;" vertex="1" parent="1">
  <mxGeometry x="800" y="650" width="600" height="20" as="geometry"/>
</mxCell>
```

### 3.3 JSON → Drawio 生成顺序

按以下层次顺序生成 mxCell，确保正确的视觉叠加：

1. **背景层**：页面背景 rect、侧边栏背景 rect
2. **布局层**：顶栏 rect、内容区卡片 rect
3. **装饰层**：Logo、面包屑、分隔线、图标
4. **内容层**：按钮、输入框、表格、文字、标签
5. **数据层**：表格数据行、统计数值

### 3.4 ID 分配

使用有意义的 `id` 前缀避免冲突：
- `bg_` — 背景
- `s_` — 侧边栏 (sidebar)
- `h_` — 顶栏 (header)
- `c_` — 内容 (content)
- `card_` — 卡片
- `btn_` — 按钮
- `inp_` — 输入框
- `txt_` — 文本
- `tbl_` — 表格
- `tag_` — 标签
- `div_` — 分隔线
- `stat_` — 统计卡片
- `step_` — 步骤条
- `page_` — 分页
- `menu_` — 菜单项

数字后缀从 1 递增。

### 3.5 组件排布约束（防重叠）

生成 drawio XML 时必须遵守以下排布规则，确保组件之间不重叠：

1. **垂直方向（Y 轴）累加**：同一卡片内的组件按 Y 轴依次排列，每个组件 y = 前一个组件 y + 前一个组件 height + 间距(16px)
2. **水平方向（X 轴）不侵入**：不同功能区域的组件不得在 X 轴方向越过区域边界
3. **文本 label 给足宽度**：标签文字 x + labelWidth + 8 < 输入框 x
4. **按钮间距**：同组按钮 x 间距 ≥ 8px，w1 + gap + w2 不超过卡片右边界
5. **表格行紧贴**：表头 → 数据行 → 分页，行之间无额外间距（rowHeight = 40, 紧贴排列）
6. **侧边栏组件不溢出**：所有侧边栏内容 x + w ≤ sidebar.width (200px)

## 第四步：重叠检测和修正

生成 drawio XML 后，**必须**运行重叠检测脚本验证组件排布。

### 4.1 运行检测

```bash
python3 /Users/zhangjr/.claude/skills/ui-to-drawio/references/check-overlap.py <file.drawio> --verbose
```

- 退出码 0 = 无重叠，通过
- 退出码 1 = 发现重叠，需要修正

### 4.2 检测规则

脚本自动忽略以下「合理重叠」（不会误报）：
- **背景容器包含**：卡片包含内部元素、表头包含文字
- **装饰元素贴边**：头像在消息气泡边缘、徽标在卡片角上
- **小型装饰叠加**：通知红点在图标上
- **分隔线贯穿**：1px 横向分隔线跨越内容区

### 4.3 修正策略

发现重叠后，按以下优先级修正：

1. **表格行重叠**：检查每行 y 坐标，确保 y_n = 表头_y + 表头_h + (n-1) × rowHeight
2. **按钮组重叠**：右侧按钮 x 至少 = 左侧按钮 x + 左侧按钮 w + 8
3. **标签-输入框重叠**：确保 labelX + labelW + 8 ≤ inputX
4. **通用垂直重叠**：将重叠的较低组件向下推移，间距 = 16px
5. **组件超出卡片**：调整组件 x 或 width，使其 x + width ≤ card.x + card.width - 24

修正后重新生成 drawio 文件，并再次运行检测。**最多循环 3 次**，超出仍检测到重叠则输出警告提示用户手动调整。

## 第五步：导出图像

### 5.1 生成和导出流程

```bash
# 1. 写入 drawio 文件
# 2. 【必须】运行重叠检测
python3 /Users/zhangjr/.claude/skills/ui-to-drawio/references/check-overlap.py output.drawio --verbose
# 3. 导出 PNG（嵌入式，保留原 .drawio 文件）
# 单页：
/Applications/draw.io.app/Contents/MacOS/draw.io -x -f png -e -b 10 -o output.drawio.png output.drawio
# 多页（每页单独导出）：
/Applications/draw.io.app/Contents/MacOS/draw.io -x -f png -e -b 10 -p 1 -o output-1.drawio.png output.drawio
/Applications/draw.io.app/Contents/MacOS/draw.io -x -f png -e -b 10 -p 2 -o output-2.drawio.png output.drawio
# 4. 同时打开结果文件
open output.drawio.png
open output.drawio
```

### 5.2 文件命名

- 根据页面标题生成文件名：kebab-case，如 `dashboard-analysis`
- 中文名转拼音或使用描述性英文名
- **同时输出两个文件**：`xxx.drawio`（可编辑源文件）+ `xxx.drawio.png`（图像预览，嵌入式可编辑）
- **多页面**：`xxx.drawio`（含所有页面标签页）+ `xxx-1.drawio.png`、`xxx-2.drawio.png`（每页独立 PNG）
- 不允许删除 `.drawio` 源文件——用户需要它来进行后续编辑

## 第六步：Review 审查与修订

初版 drawio/PNG 导出完成后，**必须**执行 Review 修订环节。Review 分为三个审查通道 + 自检流程 + 修订执行。详细检查项见 `references/review-checklist.md`。

**重要**：这是交付前的最后质量关口。不得以"初版无明显问题"为由跳过。Review 必须产出可见的修订摘要。

### 6.1 审查（三个通道必做）

**通道一：XML 自检（先于需求审查，防止返工）**

读回已生成的 .drawio 文件 XML 内容，逐区域扫描以下问题：

| 检查维度 | 检查方法 | 常见问题 | 判定阈值 |
|---------|---------|---------|---------|
| **对齐** | 同级组件 `x` 坐标是否一致（左侧对齐）或 `x + w` 一致（右侧对齐） | 按钮组左边界参差、输入框 x 不齐 | 偏差 > 4px 需修正 |
| **间距** | 相邻组件 `y` 差值是否等于前组件 `height + 16` | 垂直间距不统一（有的 16、有的 24、有的 8） | 偏差 > 4px 需修正 |
| **字号层级** | 页面标题 (≥16px) > 卡片标题 (14px) > 正文 (12-13px) > 辅助文字 (11-12px) | 标题与正文同号、辅助文字过大 | 越级即修正 |
| **颜色** | 检查 `fillColor`、`strokeColor`、`fontColor` 是否匹配 2.4 颜色参考表 | 按钮用错色、标签颜色不匹配语义 | 逐一核对即修正 |
| **组件尺寸** | 按钮 w 是否 ≥ 文字字数 × 14 + 24（中文字）/ 文字字数 × 9 + 16（英文） | 按钮太窄文字溢出、输入框太短 | w 不足即修正 |
| **信息密度** | 表格行 ≤ 8、菜单项 ≤ 10、统计卡片 ≤ 4 | 超限未截断 | 截断并加省略标记 |
| **区域边界** | 组件 `x + w ≤ card.x + card.width - 24` 且 `x ≥ card.x + 24` | 组件溢出卡片、紧贴卡片边缘 | 任一越界即修正 |

自检方式：逐一读取 XML 中每个组件 `<mxCell>` 的 `mxGeometry`，按区域分组对比坐标。发现问题立即记录到修订清单（问题描述 + 当前值 + 期望值 + 修正方案）。

**通道二：需求覆盖审查**

对照用户输入（功能描述、处理流程、页面展现信息、用户输入动作、页面响应、业务规则），逐项检查：

- 每个信息项是否有 UI 对应 → 对照需求文字，在 XML 中搜索对应的 `value` 属性或组件
- 每个用户操作是否有可见入口 → 检查是否存在对应按钮/链接/菜单项
- 处理流程中的分支/异常是否有界面态（加载、失败、空态、追问等）→ 检查 `<diagram>` 标签页是否覆盖
- TIP/约束是否在原型中体现 → 权限提示、校验标注、默认值预设等

输出：已覆盖 / 部分覆盖 / 未覆盖清单，未覆盖项标 P0/P1。**标注关联的组件 id**，便于修订定位。

**通道三：业界设计对比**

按页面类型与业界惯例对比（详见 review-checklist）：

- 后台列表/表单/Dashboard → Ant Design Pro 模式
- 对话/Copilot/智能体 → 三栏布局、可折叠步骤、结果内嵌操作、多状态页
- 审计/企业业务 → 可追溯步骤、人工确认、项目上下文

对比方法：将当前原型的布局/组件/交互模式与 review-checklist 中的「业界惯例」列逐一比对。每条差异判断：① 是否为需求特有（合理差异）→ 跳过；② 是否为遗漏 → 记录修订。

输出：差异表（维度 | 业界惯例 | 当前原型 | 是否修订 | 修订方案）。

### 6.2 修订决策

| 优先级 | 标准 | 处理 |
|--------|------|------|
| P0 | 需求明确未体现；主路径不可用；组件坐标严重错位 | **必须修订** |
| P1 | 关键状态缺失；业界主流模式未遵循；对齐/间距/字号/颜色偏差；组件尺寸不足 | **默认修订** |
| P2 | 体验优化、非阻塞 | 可选，在摘要中列出 |

### 6.3 执行修订

修订按「定位 → 修正 → 验证」循环进行，每个问题独立处理：

1. **记录修订清单**：汇总三个通道的 P0/P1 问题，格式为 `[问题] → [当前] → [期望] → [修正方案]`
2. **更新 JSON**：先在 JSON 描述中修正（补充 `states`、`pages`、调整组件坐标和属性），确保 JSON 与修复后的设计一致
3. **修改 drawio XML**：按修订清单逐项修改 `<mxGeometry>` 坐标 / `<mxCell>` style 属性 / 新增 `<diagram>` 标签页
4. **重新运行检测**：`python3 /Users/zhangjr/.claude/skills/ui-to-drawio/references/check-overlap.py <file>.drawio --verbose`，直至通过（最多 3 轮）
5. **重新导出全部 PNG**：确保所有标签页的 PNG 都更新
6. **二次自检**：修订后再次读回 XML，确认通道一中发现的坐标/字号/颜色问题已修复
7. **输出 Review 修订摘要**（见 6.4 模板）

**注意**：修订后必须重新导出所有受影响的 PNG。.drawio 与 PNG 必须版本一致。

### 6.4 Review 修订摘要模板

```markdown
## 原型 Review 摘要

### XML 自检发现
| 问题 | 位置（组件 id） | 当前值 | 修正为 |
|------|----------------|--------|--------|
| … | … | … | … |

### 需求覆盖
- 已覆盖：…
- 已修订：…

### 业界对比（已处理差异）
| 维度 | 业界惯例 | 当前原型 | 修订方案 |
|------|---------|---------|---------|
| … | … | … | … |

### 页面/状态
- 初版：N 页 → 修订后：M 页（列出标签页名）

### 可选未做（P2）
- …
```

### 6.5 对话/Copilot 类页面修订要点（高频）

若需求含智能对话、调度智能体、异步任务等，Review 时重点检查并缺则补：

- 会话列表 + 对话区 + 上下文侧栏（三栏）
- 执行过程可折叠区块
- 智能体/项目 Tag 或 Select（非仅文字按钮）
- 快捷操作挂在结果卡片/消息上
- 状态页：空态、流式加载、追问澄清、失败重试、上下文预填（按需求）
- 顶栏 Toast 与对话内结果卡片联动

## 关键原则

1. **JSON 先行**：始终先构建完整的 JSON 描述，再生成 drawio。JSON 是"设计稿"，drawio 是"实现"。
2. **坐标精确**：所有坐标在 JSON 中明确计算，不在 drawio 生成阶段猜测。
3. **组件复用**：相似组件使用一致的 cell style 字符串，保持视觉统一。
4. **颜色严格**：颜色值精确匹配 Ant Design Pro 设计规范。
5. **文字可读**：drawio 中文字不会自动换行，需要合理设置 width。按钮文字用 fontSize=12，标题用 fontSize=16。
6. **XML 严禁注释**：drawio XML 中不能出现 `<!-- -->` 注释。
7. **避免信息过载**：表格不超过 8 行，菜单不超过 10 项，统计卡片不超过 4 个。超出部分省略。
8. **双文件输出**：.drawio 和 .drawio.png 必须同时保留。使用 `-e` 标志导出保证 PNG 可编辑。不删除 .drawio 源文件。
9. **画布自适应**：根据内容多少调整画布高度（默认 800，长表单可到 1100，Dashboard 可到 900）。
10. **多页面合并**：描述中包含多个页面时，合并到一个 .drawio 文件的多个标签页中。每页独立导出 PNG。
11. **零重叠保证**：生成后必须运行 check-overlap.py 检测，发现重叠立即修正。最多循环 3 次，确保组件排布不重叠。
12. **先分析后生成**：输出 JSON 后，应该在继续生成 drawio 之前，在日志中展示 JSON 结构作为中间产物。
13. **Review 后交付**：初版导出后必须完成五个通道审查（XML 自检 → 需求覆盖 → 状态完整性 → 业界对比 → 修订执行），P0/P1 项修订完成后再次检测导出，并附 Review 摘要。
14. **状态页优先**：除 happy path 外，至少补充空态与一种异常/加载态；对话类页面建议 4～6 个状态标签页。
15. **XML 自检先行**：Review 的第一步是读回 .drawio 文件逐项检查对齐、间距、字号层级、颜色、组件尺寸、信息密度、区域边界共 7 个维度——发现问题立即记录到修订清单，避免带着坐标错误进入需求审查。
16. **修订有据**：每个修订项必须有「问题描述 → 当前值 → 期望值 → 修正方案」四要素；修订后必须二次验证 XML 并重新导出 PNG。
