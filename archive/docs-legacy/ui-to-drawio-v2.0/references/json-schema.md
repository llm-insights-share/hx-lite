# JSON 界面描述 Schema 定义

## 顶层结构

```json
{
  "meta": { ... },       // 页面元信息
  "canvas": { ... },     // 画布设置
  "regions": { ... },    // 布局区域
  "sidebar": { ... },    // 侧边栏内容（可选）
  "header": { ... },     // 顶栏内容（可选）
  "content": { ... }     // 主内容区
}
```

---

## `meta` — 页面元信息

```json
{
  "pageType": "dashboard",    // login | dashboard | form | table | exception | notification | general
  "theme": "light",           // light | dark
  "layout": "side-menu",      // side-menu | top-menu | mixed-menu | centered
  "title": "工作台",           // 页面标题
  "subtitle": "分析页"         // 可选副标题
}
```

## `canvas` — 画布设置

```json
{
  "width": 1440,
  "height": 800,              // 可根据内容调整：表单 1100, Dashboard 900, 默认 800
  "background": "#F0F2F5"    // 画布背景色
}
```

## `regions` — 布局区域

每个 region 包含 `{ x, y, width, height, fill, visible }`。

### side-menu 布局

```json
{
  "sidebar": {
    "x": 0, "y": 0, "width": 200, "height": 800,
    "fill": "#001529", "visible": true
  },
  "header": {
    "x": 200, "y": 0, "width": 1240, "height": 48,
    "fill": "#FFFFFF", "visible": true
  },
  "content": {
    "x": 200, "y": 48, "width": 1240, "height": 752
  }
}
```

### top-menu 布局

```json
{
  "sidebar": { "visible": false },
  "header": {
    "x": 0, "y": 0, "width": 1440, "height": 48,
    "fill": "#001529", "visible": true
  },
  "content": {
    "x": 0, "y": 48, "width": 1440, "height": 752
  }
}
```

### mixed-menu 布局

```json
{
  "sidebar": {
    "x": 0, "y": 48, "width": 200, "height": 752,
    "fill": "#FFFFFF", "visible": true
  },
  "header": {
    "x": 0, "y": 0, "width": 1440, "height": 48,
    "fill": "#001529", "visible": true
  },
  "content": {
    "x": 200, "y": 48, "width": 1240, "height": 752
  }
}
```

### centered 布局（登录页）

```json
{
  "sidebar": { "visible": false },
  "header": { "visible": false },
  "content": {
    "x": 0, "y": 0, "width": 1440, "height": 800
  }
}
```

---

## `sidebar` — 侧边栏内容

```json
{
  "logo": {
    "x": 24, "y": 16, "width": 152, "height": 32,
    "text": "Ant Design Pro",
    "fontSize": 16,
    "fontColor": "#FFFFFF",
    "fontWeight": "bold"
  },
  "menuItems": [
    {
      "text": "Dashboard",
      "icon": "dashboard",      // dashboard|form|table|user|setting|notification|...
      "active": true,           // 当前选中
      "children": [],           // 子菜单项（可选，递归结构）
      "y": 64                   // 绝对 y 坐标
    },
    {
      "text": "表单页",
      "icon": "form",
      "active": false,
      "children": [
        { "text": "基础表单", "active": false, "y": 104 },
        { "text": "高级表单", "active": false, "y": 144 }
      ],
      "y": 104
    }
  ]
}
```

**菜单项坐标规则**：
- 第一个菜单项 y = 64（Logo 下方 16px）
- 后续菜单项 y = 前一项 y + 40（菜单项高 40px）
- 子菜单缩进：text 的 x 偏移 +16px

---

## `header` — 顶栏内容

```json
{
  "breadcrumb": [
    { "text": "首页", "link": false },
    { "text": "Dashboard", "link": false },
    { "text": "分析页", "link": false, "active": true }
  ],
  "title": "分析页",
  "actions": [
    { "type": "icon", "icon": "bell", "badge": 5 },
    { "type": "avatar", "text": "Zhang", "avatar": "U" }
  ]
}
```

**面包屑**：显示在顶栏下方（内容区顶部），y = header.y + header.height + 2 = 50
**标题**：面包屑下方，y = 74

---

## `content.components` — 内容区组件

`content` 包含一个 `components` 数组，每个组件有通用的基础属性：

```json
{
  "id": "唯一标识",
  "type": "组件类型",
  "x": 224, "y": 96,          // 绝对坐标
  "width": 600, "height": 40, // 尺寸
  // ... 类型特定属性
}
```

### 组件类型详解

#### card（卡片容器）

```json
{
  "id": "card_1",
  "type": "card",
  "x": 224, "y": 72,
  "width": 1192, "height": 400,
  "title": "卡片标题",
  "children": [ ... ]          // 卡片内组件数组
}
```

卡片内组件坐标相对于卡片原点：
- 卡片内第 1 个子组件 y = card.y + 40（标题高度）
- 卡片内后续子组件 y 累加（间距 16px）

#### stat-card（统计卡片）

```json
{
  "id": "stat_1",
  "type": "stat-card",
  "x": 224, "y": 72,
  "width": 280, "height": 140,
  "icon": "dollar",            // 图标类型
  "iconColor": "#1890FF",      // 图标区域颜色
  "value": "¥ 126,560",
  "label": "总销售额",
  "trend": "up",               // up|down|none
  "trendValue": "12%",
  "footerText": "较昨日"
}
```

**统计卡片布局规则**：
- 每行最多 4 个，等分可用宽度
- 间距 16px（gap = 16）
- 单卡宽度 = (content可用宽度 - 3*16) / 4
- 内部布局：图标(36x36) → 数值(24px字号) → 标签(12px)

#### button（按钮）

```json
{
  "id": "btn_1",
  "type": "button",
  "x": 224, "y": 200,
  "width": 80, "height": 32,
  "text": "提交",
  "variant": "primary",        // primary|secondary|danger|link
  "disabled": false
}
```

#### input（输入框）

```json
{
  "id": "inp_1",
  "type": "input",
  "x": 350, "y": 150,
  "width": 300, "height": 32,
  "label": "用户名",
  "labelX": 224, "labelY": 153,  // 标签坐标（通常在输入框左侧）
  "placeholder": "请输入用户名",
  "required": true
}
```

**输入框标签布局规则**：
- 标签与输入框在同一行（水平排列）
- 标签 x = 卡片左边缘 + 24
- 输入框 x = 标签 x + 标签宽度 + 16
- 标签宽度通常为 80-120px（根据文字长度）

#### select（选择器）

```json
{
  "id": "sel_1",
  "type": "select",
  "x": 350, "y": 200,
  "width": 200, "height": 32,
  "label": "状态",
  "labelX": 224, "labelY": 203,
  "placeholder": "请选择",
  "options": ["全部", "启用", "禁用"]
}
```

#### table（表格）

```json
{
  "id": "tbl_1",
  "type": "table",
  "x": 248, "y": 200,
  "width": 1144,
  "columns": [
    { "text": "列名", "width": 200, "align": "left" }
  ],
  "rows": [
    [ "数据1-1", "数据1-2", "数据1-3" ]
  ],
  "rowHeight": 40,
  "headerHeight": 40,
  "hasBorder": true,
  "hasPagination": true,
  "pagination": {
    "total": 100,
    "pageSize": 10,
    "current": 1,
    "x": 800, "y": 650     // 分页组件坐标
  }
}
```

**表格列宽规则**：
- 有 N 列时，每列宽度 = (表格总宽 - 首列缩进 48) / N
- 首列通常稍宽（+20%），末列操作列宽度固定 120px
- 表格最大行数 = 8 行（超出省略）

#### search-bar（搜索栏）

```json
{
  "id": "search_1",
  "type": "search-bar",
  "x": 248, "y": 96,
  "fields": [
    { "label": "用户名", "type": "input", "width": 200 },
    { "label": "状态", "type": "select", "width": 150 }
  ],
  "buttons": [
    { "text": "查询", "variant": "primary" },
    { "text": "重置", "variant": "secondary" }
  ]
}
```

**搜索栏布局规则**：
- 字段水平排列，间距 16px
- 按钮在字段右侧，查询按钮在前，重置在后
- 如字段过多（>4个），可换行折叠为"展开/收起"模式

#### text（文本）

```json
{
  "id": "txt_1",
  "type": "text",
  "x": 224, "y": 150,
  "width": 200, "height": 22,
  "content": "一段文字内容",
  "variant": "title",          // title(16px, bold) | body(13px) | secondary(12px, gray)
  "align": "left"              // left|center|right
}
```

#### tag（标签/徽标）

```json
{
  "id": "tag_1",
  "type": "tag",
  "x": 500, "y": 150,
  "width": 56, "height": 22,
  "text": "进行中",
  "color": "blue"              // blue|green|red|orange|default
}
```

#### divider（分隔线）

```json
{
  "id": "div_1",
  "type": "divider",
  "x": 248, "y": 300,
  "width": 1144,
  "text": ""                   // 可选分隔文字（居中）
}
```

#### icon-button（图标按钮/操作图标）

```json
{
  "id": "icon_1",
  "type": "icon-button",
  "x": 600, "y": 150,
  "width": 24, "height": 24,
  "icon": "edit",              // edit|delete|view|add|search|download|upload
  "tooltip": "编辑",
  "color": "#1890FF"
}
```

#### steps（步骤条）

```json
{
  "id": "steps_1",
  "type": "steps",
  "x": 300, "y": 96,
  "width": 800,
  "current": 0,                // 当前步骤索引（从0开始）
  "items": [
    { "text": "填写信息" },
    { "text": "确认信息" },
    { "text": "完成" }
  ]
}
```

#### tabs（标签页选项卡）

```json
{
  "id": "tabs_1",
  "type": "tabs",
  "x": 248, "y": 120,
  "items": [
    { "text": "选项卡1", "active": true },
    { "text": "选项卡2", "active": false },
    { "text": "选项卡3", "active": false }
  ]
}
```

#### chart-placeholder（图表占位）

```json
{
  "id": "chart_1",
  "type": "chart-placeholder",
  "x": 248, "y": 200,
  "width": 560, "height": 300,
  "chartType": "line",         // line|bar|pie|area
  "title": "销售趋势",
  "description": "（图表区域）"  // 占位文字
}
```

#### avatar（头像）

```json
{
  "id": "avt_1",
  "type": "avatar",
  "x": 1200, "y": 8,
  "width": 32, "height": 32,
  "text": "U",                 // 头像内文字（首字母）
  "bgColor": "#1890FF"
}
```

#### notification-item（通知条目）

```json
{
  "id": "notif_1",
  "type": "notification-item",
  "x": 248, "y": 150,
  "width": 1144, "height": 60,
  "avatar": "系统",
  "title": "系统通知",
  "content": "您有一条新的消息",
  "time": "5分钟前",
  "unread": true
}
```

---

## 完整示例

### 示例 1：基础表单页 JSON

```json
{
  "meta": {
    "pageType": "form",
    "theme": "light",
    "layout": "side-menu",
    "title": "基础表单"
  },
  "canvas": {
    "width": 1440,
    "height": 800,
    "background": "#F0F2F5"
  },
  "regions": {
    "sidebar": { "x": 0, "y": 0, "width": 200, "height": 800, "fill": "#001529", "visible": true },
    "header": { "x": 200, "y": 0, "width": 1240, "height": 48, "fill": "#FFFFFF", "visible": true },
    "content": { "x": 200, "y": 48, "width": 1240, "height": 752 }
  },
  "sidebar": {
    "logo": { "x": 24, "y": 16, "width": 152, "height": 32, "text": "Ant Design Pro" },
    "menuItems": [
      { "text": "Dashboard", "icon": "dashboard", "active": false, "y": 64 },
      { "text": "表单页", "icon": "form", "active": true, "y": 104, "children": [
        { "text": "基础表单", "active": true, "y": 144 }
      ]},
      { "text": "列表页", "icon": "table", "active": false, "y": 184 },
      { "text": "异常页", "icon": "warning", "active": false, "y": 224 }
    ]
  },
  "header": {
    "breadcrumb": [
      { "text": "首页" },
      { "text": "表单页" },
      { "text": "基础表单", "active": true }
    ]
  },
  "content": {
    "components": [
      {
        "id": "card_1",
        "type": "card",
        "x": 224, "y": 72,
        "width": 1192, "height": 450,
        "title": "基础表单",
        "children": [
          {
            "id": "inp_name", "type": "input",
            "x": 424, "y": 136, "width": 350, "height": 32,
            "label": "名称", "labelX": 328, "labelY": 139,
            "placeholder": "请输入名称", "required": true
          },
          {
            "id": "sel_status", "type": "select",
            "x": 424, "y": 184, "width": 350, "height": 32,
            "label": "状态", "labelX": 328, "labelY": 187,
            "placeholder": "请选择状态"
          },
          {
            "id": "inp_desc", "type": "input",
            "x": 424, "y": 232, "width": 350, "height": 80,
            "label": "描述", "labelX": 328, "labelY": 235,
            "placeholder": "请输入描述", "multiline": true
          },
          {
            "id": "div_1", "type": "divider",
            "x": 328, "y": 340, "width": 1040
          },
          {
            "id": "btn_submit", "type": "button",
            "x": 500, "y": 365, "width": 80, "height": 32,
            "text": "提交", "variant": "primary"
          },
          {
            "id": "btn_cancel", "type": "button",
            "x": 596, "y": 365, "width": 80, "height": 32,
            "text": "取消", "variant": "secondary"
          }
        ]
      }
    ]
  }
}
```

### 示例 2：登录页 JSON

```json
{
  "meta": {
    "pageType": "login",
    "theme": "light",
    "layout": "centered",
    "title": "账户密码登录"
  },
  "canvas": {
    "width": 1440,
    "height": 800,
    "background": "#F0F2F5"
  },
  "regions": {
    "sidebar": { "visible": false },
    "header": { "visible": false },
    "content": { "x": 0, "y": 0, "width": 1440, "height": 800 }
  },
  "sidebar": { "logo": null, "menuItems": [] },
  "header": { "breadcrumb": [], "actions": [] },
  "content": {
    "components": [
      {
        "id": "login_card",
        "type": "card",
        "x": 530, "y": 160,
        "width": 380, "height": 420,
        "children": [
          {
            "id": "login_logo", "type": "text",
            "x": 620, "y": 190, "width": 200, "height": 40,
            "content": "Ant Design", "variant": "title", "align": "center"
          },
          {
            "id": "login_title", "type": "text",
            "x": 600, "y": 235, "width": 240, "height": 24,
            "content": "账户密码登录", "variant": "body", "align": "center"
          },
          {
            "id": "tabs_login", "type": "tabs",
            "x": 554, "y": 265,
            "items": [
              { "text": "账户登录", "active": true },
              { "text": "手机登录", "active": false }
            ]
          },
          {
            "id": "inp_username", "type": "input",
            "x": 554, "y": 310, "width": 332, "height": 40,
            "placeholder": "请输入用户名"
          },
          {
            "id": "inp_password", "type": "input",
            "x": 554, "y": 360, "width": 332, "height": 40,
            "placeholder": "请输入密码", "password": true
          },
          {
            "id": "btn_login", "type": "button",
            "x": 554, "y": 420, "width": 332, "height": 40,
            "text": "登  录", "variant": "primary"
          },
          {
            "id": "txt_forgot", "type": "text",
            "x": 554, "y": 475, "width": 150, "height": 20,
            "content": "忘记密码", "variant": "secondary"
          },
          {
            "id": "txt_register", "type": "text",
            "x": 736, "y": 475, "width": 150, "height": 20,
            "content": "注册账号", "variant": "secondary", "align": "right"
          }
        ]
      }
    ]
  }
}
```

### 示例 3：Dashboard 工作台 JSON

```json
{
  "meta": {
    "pageType": "dashboard",
    "theme": "light",
    "layout": "side-menu",
    "title": "工作台"
  },
  "canvas": {
    "width": 1440,
    "height": 900,
    "background": "#F0F2F5"
  },
  "regions": {
    "sidebar": { "x": 0, "y": 0, "width": 200, "height": 900, "fill": "#001529", "visible": true },
    "header": { "x": 200, "y": 0, "width": 1240, "height": 48, "fill": "#FFFFFF", "visible": true },
    "content": { "x": 200, "y": 48, "width": 1240, "height": 852 }
  },
  "sidebar": {
    "logo": { "x": 24, "y": 16, "width": 152, "height": 32, "text": "Ant Design Pro" },
    "menuItems": [
      { "text": "Dashboard", "icon": "dashboard", "active": true, "y": 64 },
      { "text": "表单页", "icon": "form", "active": false, "y": 104 },
      { "text": "列表页", "icon": "table", "active": false, "y": 144 }
    ]
  },
  "header": {
    "breadcrumb": [{ "text": "首页" }, { "text": "Dashboard", "active": true }]
  },
  "content": {
    "components": [
      {
        "id": "stats_row",
        "type": "card",
        "x": 224, "y": 72, "width": 1192, "height": 150,
        "children": [
          { "id": "stat_1", "type": "stat-card", "x": 248, "y": 80, "width": 274, "height": 134,
            "icon": "dollar", "iconColor": "#1890FF", "value": "¥ 126,560", "label": "总销售额", "trend": "up", "trendValue": "12%" },
          { "id": "stat_2", "type": "stat-card", "x": 538, "y": 80, "width": 274, "height": 134,
            "icon": "user", "iconColor": "#52C41A", "value": "8,846", "label": "访问量", "trend": "down", "trendValue": "5%" },
          { "id": "stat_3", "type": "stat-card", "x": 828, "y": 80, "width": 274, "height": 134,
            "icon": "shopping", "iconColor": "#FAAD14", "value": "6,560", "label": "支付笔数", "trend": "up", "trendValue": "8%" },
          { "id": "stat_4", "type": "stat-card", "x": 1118, "y": 80, "width": 274, "height": 134,
            "icon": "activity", "iconColor": "#FF4D4F", "value": "78%", "label": "运营活动效果", "trend": "up", "trendValue": "3%" }
        ]
      },
      {
        "id": "chart_card",
        "type": "card",
        "x": 224, "y": 238, "width": 700, "height": 350,
        "title": "销售趋势",
        "children": [
          { "id": "chart_1", "type": "chart-placeholder", "x": 248, "y": 278, "width": 652, "height": 286 }
        ]
      },
      {
        "id": "rank_card",
        "type": "card",
        "x": 940, "y": 238, "width": 476, "height": 350,
        "title": "门店销售额排名",
        "children": [
          { "id": "tbl_rank", "type": "table", "x": 964, "y": 278, "width": 428,
            "columns": [{ "text": "排名", "width": 60 }, { "text": "门店", "width": 200 }, { "text": "销售额", "width": 168 }],
            "rows": [
              ["1", "工专路 0 号店", "¥ 323,234"],
              ["2", "工专路 1 号店", "¥ 323,234"],
              ["3", "工专路 2 号店", "¥ 323,234"],
              ["4", "工专路 3 号店", "¥ 323,234"]
            ]
          }
        ]
      }
    ]
  }
}
```
