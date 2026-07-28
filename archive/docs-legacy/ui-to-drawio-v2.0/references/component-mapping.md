# JSON 组件 → Drawio mxCell 映射表

## 概述

本文档定义了每种 JSON 组件类型到 drawio `mxCell` XML 的精确映射。
所有坐标、尺寸、颜色值均来自 JSON，映射规则保证生成的 drawio 视觉上匹配 Ant Design Pro 风格。

## 映射基础

每个 mxCell 需要：
- 唯一的 `id`（使用前缀+数字）
- `parent="1"`（默认图层）
- `vertex="1"`（可见元素）
- `value` — 显示文字
- `style` — 样式字符串（分号分隔的键值对）
- `mxGeometry` — 位置和尺寸

---

## 组件映射

### 1. 背景区域 (Region Background)

**JSON**: `regions.sidebar`, `regions.header`, `regions.content`

```xml
<!-- 侧边栏背景 -->
<mxCell id="bg_sidebar" value="" style="rounded=0;whiteSpace=wrap;html=1;
fillColor=#001529;strokeColor=#001529;" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="200" height="800" as="geometry"/>
</mxCell>

<!-- 顶栏背景(亮色/侧边布局) -->
<mxCell id="bg_header" value="" style="rounded=0;whiteSpace=wrap;html=1;
fillColor=#FFFFFF;strokeColor=#F0F0F0;" vertex="1" parent="1">
  <mxGeometry x="200" y="0" width="1240" height="48" as="geometry"/>
</mxCell>

<!-- 顶栏背景(暗色/顶部布局) -->
<mxCell id="bg_header" value="" style="rounded=0;whiteSpace=wrap;html=1;
fillColor=#001529;strokeColor=#001529;" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="1440" height="48" as="geometry"/>
</mxCell>

<!-- 页面背景 -->
<mxCell id="bg_page" value="" style="rounded=0;whiteSpace=wrap;html=1;
fillColor=#F0F2F5;strokeColor=#F0F2F5;" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="1440" height="800" as="geometry"/>
</mxCell>
```

### 2. Logo

**JSON**: `sidebar.logo`

```xml
<mxCell id="s_logo" value="Ant Design Pro" style="text;html=1;
strokeColor=none;fillColor=none;align=left;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=16;fontColor=#FFFFFF;fontStyle=1;"
vertex="1" parent="1">
  <mxGeometry x="24" y="16" width="152" height="32" as="geometry"/>
</mxCell>
```

### 3. 菜单项 (Menu Item)

**JSON**: `sidebar.menuItems[]`

```xml
<!-- 非激活菜单项 -->
<mxCell id="menu_1" value="Dashboard" style="rounded=0;whiteSpace=wrap;html=1;
fillColor=#001529;strokeColor=#001529;fontColor=#A6A6A6;
fontSize=13;align=left;spacingLeft=24;" vertex="1" parent="1">
  <mxGeometry x="0" y="64" width="200" height="40" as="geometry"/>
</mxCell>

<!-- 激活菜单项 -->
<mxCell id="menu_2" value="表单页" style="rounded=0;whiteSpace=wrap;html=1;
fillColor=#1890FF;strokeColor=#1890FF;fontColor=#FFFFFF;
fontSize=13;align=left;spacingLeft=24;" vertex="1" parent="1">
  <mxGeometry x="0" y="104" width="200" height="40" as="geometry"/>
</mxCell>

<!-- 子菜单项（暗色侧边栏） -->
<mxCell id="menu_2_1" value="基础表单" style="rounded=0;whiteSpace=wrap;html=1;
fillColor=#000C17;strokeColor=#000C17;fontColor=#A6A6A6;
fontSize=13;align=left;spacingLeft=48;" vertex="1" parent="1">
  <mxGeometry x="0" y="144" width="200" height="40" as="geometry"/>
</mxCell>
```

### 4. 面包屑 (Breadcrumb)

**JSON**: `header.breadcrumb[]`

```xml
<mxCell id="h_breadcrumb" value="首页 / 表单页 / 基础表单" style="text;html=1;
strokeColor=none;fillColor=none;align=left;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=12;fontColor=#8C8C8C;"
vertex="1" parent="1">
  <mxGeometry x="224" y="50" width="400" height="20" as="geometry"/>
</mxCell>
```

### 5. 卡片 (Card)

**JSON**: `type: "card"`

```xml
<!-- 卡片背景 -->
<mxCell id="card_1" value="" style="rounded=1;whiteSpace=wrap;html=1;
fillColor=#FFFFFF;strokeColor=#F0F0F0;arcSize=4;" vertex="1" parent="1">
  <mxGeometry x="224" y="72" width="1192" height="400" as="geometry"/>
</mxCell>
<!-- 卡片标题 -->
<mxCell id="card_1_title" value="卡片标题" style="text;html=1;
strokeColor=none;fillColor=none;align=left;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=16;fontColor=#262626;fontStyle=1;"
vertex="1" parent="1">
  <mxGeometry x="248" y="88" width="300" height="22" as="geometry"/>
</mxCell>
```

注意：卡片标题不单独用一个 rect，而是用 text 组件放置文字。卡片背景是一个大 rect。

### 6. 统计卡片 (Stat Card)

**JSON**: `type: "stat-card"`

```xml
<!-- 卡片背景 -->
<mxCell id="stat_1_bg" value="" style="rounded=1;whiteSpace=wrap;html=1;
fillColor=#FFFFFF;strokeColor=#F0F0F0;arcSize=4;" vertex="1" parent="1">
  <mxGeometry x="248" y="80" width="274" height="134" as="geometry"/>
</mxCell>
<!-- 图标装饰（小圆或小矩形） -->
<mxCell id="stat_1_icon" value="" style="rounded=1;whiteSpace=wrap;html=1;
fillColor=#E6F7FF;strokeColor=#E6F7FF;arcSize=8;" vertex="1" parent="1">
  <mxGeometry x="272" y="100" width="40" height="40" as="geometry"/>
</mxCell>
<!-- 数值 -->
<mxCell id="stat_1_val" value="¥ 126,560" style="text;html=1;
strokeColor=none;fillColor=none;align=left;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=24;fontColor=#262626;fontStyle=1;"
vertex="1" parent="1">
  <mxGeometry x="272" y="148" width="226" height="30" as="geometry"/>
</mxCell>
<!-- 标签 -->
<mxCell id="stat_1_label" value="总销售额" style="text;html=1;
strokeColor=none;fillColor=none;align=left;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=13;fontColor=#8C8C8C;"
vertex="1" parent="1">
  <mxGeometry x="272" y="178" width="226" height="18" as="geometry"/>
</mxCell>
```

### 7. 按钮 (Button)

**JSON**: `type: "button"`

```xml
<!-- 主色按钮 -->
<mxCell id="btn_1" value="提交" style="rounded=1;whiteSpace=wrap;html=1;
fillColor=#1890FF;strokeColor=#1890FF;fontColor=#FFFFFF;
fontSize=12;arcSize=12;" vertex="1" parent="1">
  <mxGeometry x="500" y="365" width="80" height="32" as="geometry"/>
</mxCell>

<!-- 次色按钮 -->
<mxCell id="btn_2" value="取消" style="rounded=1;whiteSpace=wrap;html=1;
fillColor=#FFFFFF;strokeColor=#D9D9D9;fontColor=#262626;
fontSize=12;arcSize=12;" vertex="1" parent="1">
  <mxGeometry x="596" y="365" width="80" height="32" as="geometry"/>
</mxCell>

<!-- 危险按钮 -->
<mxCell id="btn_3" value="删除" style="rounded=1;whiteSpace=wrap;html=1;
fillColor=#FF4D4F;strokeColor=#FF4D4F;fontColor=#FFFFFF;
fontSize=12;arcSize=12;" vertex="1" parent="1">
  <mxGeometry x="692" y="365" width="80" height="32" as="geometry"/>
</mxCell>

<!-- 链接按钮 -->
<mxCell id="btn_4" value="查看详情" style="text;html=1;
strokeColor=none;fillColor=none;align=left;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=12;fontColor=#1890FF;"
vertex="1" parent="1">
  <mxGeometry x="500" y="450" width="80" height="22" as="geometry"/>
</mxCell>
```

### 8. 输入框 (Input)

**JSON**: `type: "input"`

```xml
<!-- 输入框标签 -->
<mxCell id="inp_1_label" value="用户名" style="text;html=1;
strokeColor=none;fillColor=none;align=right;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=13;fontColor=#262626;"
vertex="1" parent="1">
  <mxGeometry x="328" y="139" width="80" height="32" as="geometry"/>
</mxCell>

<!-- 输入框(空值) -->
<mxCell id="inp_1" value="请输入用户名" style="rounded=1;whiteSpace=wrap;html=1;
fillColor=#FFFFFF;strokeColor=#D9D9D9;fontColor=#BFBFBF;
fontSize=12;arcSize=4;align=left;spacingLeft=8;" vertex="1" parent="1">
  <mxGeometry x="424" y="136" width="350" height="32" as="geometry"/>
</mxCell>

<!-- 必填标记 -->
<mxCell id="inp_1_required" value="*" style="text;html=1;
strokeColor=none;fillColor=none;align=left;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=13;fontColor=#FF4D4F;"
vertex="1" parent="1">
  <mxGeometry x="316" y="139" width="12" height="32" as="geometry"/>
</mxCell>

<!-- 多行输入框(Textarea) -->
<mxCell id="inp_2" value="请输入描述" style="rounded=1;whiteSpace=wrap;html=1;
fillColor=#FFFFFF;strokeColor=#D9D9D9;fontColor=#BFBFBF;
fontSize=12;arcSize=4;align=left;spacingLeft=8;verticalAlign=top;spacingTop=8;"
vertex="1" parent="1">
  <mxGeometry x="424" y="232" width="350" height="80" as="geometry"/>
</mxCell>
```

### 9. 选择器 (Select)

**JSON**: `type: "select"`

```xml
<!-- 选择器标签 -->
<mxCell id="sel_1_label" value="状态" style="text;html=1;
strokeColor=none;fillColor=none;align=right;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=13;fontColor=#262626;"
vertex="1" parent="1">
  <mxGeometry x="328" y="187" width="80" height="32" as="geometry"/>
</mxCell>

<!-- 选择器 -->
<mxCell id="sel_1" value="请选择 ▼" style="rounded=1;whiteSpace=wrap;html=1;
fillColor=#FFFFFF;strokeColor=#D9D9D9;fontColor=#BFBFBF;
fontSize=12;arcSize=4;align=left;spacingLeft=8;" vertex="1" parent="1">
  <mxGeometry x="424" y="184" width="350" height="32" as="geometry"/>
</mxCell>
```

### 10. 表格 (Table)

**JSON**: `type: "table"`

表格每列生成独立的 cell（表头和数据行都用一组 cell 拼接）：

```xml
<!-- 表头行（整个深色条） -->
<mxCell id="tbl_1_header" value="" style="rounded=0;whiteSpace=wrap;html=1;
fillColor=#FAFAFA;strokeColor=#F0F0F0;" vertex="1" parent="1">
  <mxGeometry x="248" y="278" width="1144" height="40" as="geometry"/>
</mxCell>

<!-- 表头列文字（分别生成） -->
<mxCell id="tbl_1_h1" value="排名" style="text;html=1;
strokeColor=none;fillColor=none;align=left;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=13;fontColor=#262626;fontStyle=1;"
vertex="1" parent="1">
  <mxGeometry x="264" y="288" width="60" height="20" as="geometry"/>
</mxCell>
<mxCell id="tbl_1_h2" value="门店" style="text;html=1;strokeColor=none;fillColor=none;
align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;
fontSize=13;fontColor=#262626;fontStyle=1;" vertex="1" parent="1">
  <mxGeometry x="324" y="288" width="200" height="20" as="geometry"/>
</mxCell>
<mxCell id="tbl_1_h3" value="销售额" style="text;html=1;strokeColor=none;fillColor=none;
align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;
fontSize=13;fontColor=#262626;fontStyle=1;" vertex="1" parent="1">
  <mxGeometry x="524" y="288" width="168" height="20" as="geometry"/>
</mxCell>

<!-- 分隔线（表头下方） -->
<mxCell id="tbl_1_div_0" value="" style="rounded=0;whiteSpace=wrap;html=1;
fillColor=#F0F0F0;strokeColor=#F0F0F0;" vertex="1" parent="1">
  <mxGeometry x="248" y="318" width="1144" height="1" as="geometry"/>
</mxCell>

<!-- 数据行1 -->
<mxCell id="tbl_1_r1" value="" style="rounded=0;whiteSpace=wrap;html=1;
fillColor=#FFFFFF;strokeColor=#F0F0F0;" vertex="1" parent="1">
  <mxGeometry x="248" y="319" width="1144" height="40" as="geometry"/>
</mxCell>
<mxCell id="tbl_1_r1c1" value="1" style="text;html=1;strokeColor=none;fillColor=none;
align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;
fontSize=12;fontColor=#595959;" vertex="1" parent="1">
  <mxGeometry x="264" y="329" width="60" height="20" as="geometry"/>
</mxCell>
<!-- ... 更多数据行 -->
```

简化版——用纯文本表示表格内容：
```xml
<!-- 表头 -->
<mxCell id="tbl_header" value="排名    门店              销售额"
  style="rounded=0;whiteSpace=wrap;html=1;fillColor=#FAFAFA;
  strokeColor=#F0F0F0;fontColor=#262626;fontSize=12;fontStyle=1;
  align=left;spacingLeft=16;" vertex="1" parent="1">
  <mxGeometry x="248" y="278" width="1144" height="40" as="geometry"/>
</mxCell>
<!-- 数据行 -->
<mxCell id="tbl_r1" value="1        工专路 0 号店    ¥ 323,234"
  style="rounded=0;whiteSpace=wrap;html=1;fillColor=#FFFFFF;
  strokeColor=#F0F0F0;fontColor=#595959;fontSize=12;
  align=left;spacingLeft=16;" vertex="1" parent="1">
  <mxGeometry x="248" y="318" width="1144" height="40" as="geometry"/>
</mxCell>
```

### 11. 搜索栏 (Search Bar)

**JSON**: `type: "search-bar"`

```xml
<!-- 搜索栏背景 -->
<mxCell id="search_bg" value="" style="rounded=1;whiteSpace=wrap;html=1;
fillColor=#FFFFFF;strokeColor=#F0F0F0;arcSize=4;" vertex="1" parent="1">
  <mxGeometry x="248" y="96" width="1144" height="56" as="geometry"/>
</mxCell>
<!-- 搜索字段标签 -->
<mxCell id="search_l1" value="用户名:" style="text;html=1;
strokeColor=none;fillColor=none;align=left;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=13;fontColor=#262626;"
vertex="1" parent="1">
  <mxGeometry x="264" y="108" width="56" height="20" as="geometry"/>
</mxCell>
<!-- 搜索输入框 -->
<mxCell id="search_inp1" value="请输入" style="rounded=1;whiteSpace=wrap;html=1;
fillColor=#FFFFFF;strokeColor=#D9D9D9;fontColor=#BFBFBF;fontSize=12;
arcSize=4;align=left;spacingLeft=8;" vertex="1" parent="1">
  <mxGeometry x="324" y="102" width="180" height="32" as="geometry"/>
</mxCell>
<!-- 查询按钮 -->
<mxCell id="search_btn1" value="查询" style="rounded=1;whiteSpace=wrap;html=1;
fillColor=#1890FF;strokeColor=#1890FF;fontColor=#FFFFFF;
fontSize=12;arcSize=12;" vertex="1" parent="1">
  <mxGeometry x="520" y="102" width="64" height="32" as="geometry"/>
</mxCell>
<!-- 重置按钮 -->
<mxCell id="search_btn2" value="重置" style="rounded=1;whiteSpace=wrap;html=1;
fillColor=#FFFFFF;strokeColor=#D9D9D9;fontColor=#262626;
fontSize=12;arcSize=12;" vertex="1" parent="1">
  <mxGeometry x="592" y="102" width="64" height="32" as="geometry"/>
</mxCell>
```

### 12. 分隔线 (Divider)

**JSON**: `type: "divider"`

```xml
<mxCell id="div_1" value="" style="rounded=0;whiteSpace=wrap;html=1;
fillColor=#F0F0F0;strokeColor=#F0F0F0;" vertex="1" parent="1">
  <mxGeometry x="248" y="340" width="1144" height="1" as="geometry"/>
</mxCell>
```

### 13. 步骤条 (Steps)

**JSON**: `type: "steps"`

每个步骤生成一个圆点 + 一个文字标签。步骤之间用横线连接。

```xml
<!-- 步骤1圆点(已完成/当前) -->
<mxCell id="step_1_dot" value="" style="ellipse;whiteSpace=wrap;html=1;
fillColor=#1890FF;strokeColor=#1890FF;" vertex="1" parent="1">
  <mxGeometry x="400" y="100" width="24" height="24" as="geometry"/>
</mxCell>
<!-- 步骤1文字 -->
<mxCell id="step_1_text" value="填写信息" style="text;html=1;
strokeColor=none;fillColor=none;align=center;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=13;fontColor=#262626;"
vertex="1" parent="1">
  <mxGeometry x="360" y="128" width="104" height="20" as="geometry"/>
</mxCell>

<!-- 步骤间连接线 -->
<mxCell id="step_line_1" value="" style="rounded=0;whiteSpace=wrap;html=1;
fillColor=#1890FF;strokeColor=#1890FF;" vertex="1" parent="1">
  <mxGeometry x="424" y="110" width="152" height="4" as="geometry"/>
</mxCell>

<!-- 步骤2圆点(未完成) -->
<mxCell id="step_2_dot" value="" style="ellipse;whiteSpace=wrap;html=1;
fillColor=#F5F5F5;strokeColor=#D9D9D9;" vertex="1" parent="1">
  <mxGeometry x="600" y="100" width="24" height="24" as="geometry"/>
</mxCell>
<!-- 步骤2文字 -->
<mxCell id="step_2_text" value="确认信息" style="text;html=1;
strokeColor=none;fillColor=none;align=center;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=13;fontColor=#8C8C8C;"
vertex="1" parent="1">
  <mxGeometry x="560" y="128" width="104" height="20" as="geometry"/>
</mxCell>
```

### 14. 标签/选项卡 (Tabs)

**JSON**: `type: "tabs"`

```xml
<!-- Tab 背景条 -->
<mxCell id="tabs_bg" value="" style="rounded=0;whiteSpace=wrap;html=1;
fillColor=none;strokeColor=#F0F0F0;" vertex="1" parent="1">
  <mxGeometry x="554" y="265" width="332" height="36" as="geometry"/>
</mxCell>
<!-- 激活 Tab -->
<mxCell id="tab_1" value="账户登录" style="text;html=1;
strokeColor=none;fillColor=none;align=center;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=13;fontColor=#1890FF;fontStyle=1;"
vertex="1" parent="1">
  <mxGeometry x="554" y="268" width="80" height="30" as="geometry"/>
</mxCell>
<!-- 激活指示线 -->
<mxCell id="tab_1_line" value="" style="rounded=0;whiteSpace=wrap;html=1;
fillColor=#1890FF;strokeColor=#1890FF;" vertex="1" parent="1">
  <mxGeometry x="554" y="298" width="80" height="2" as="geometry"/>
</mxCell>
<!-- 非激活 Tab -->
<mxCell id="tab_2" value="手机登录" style="text;html=1;
strokeColor=none;fillColor=none;align=center;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=13;fontColor=#8C8C8C;"
vertex="1" parent="1">
  <mxGeometry x="634" y="268" width="80" height="30" as="geometry"/>
</mxCell>
```

### 15. 图表占位 (Chart Placeholder)

**JSON**: `type: "chart-placeholder"`

```xml
<!-- 图表区域（浅灰背景带虚线边框效果，用浅色填充模拟） -->
<mxCell id="chart_1" value="" style="rounded=1;whiteSpace=wrap;html=1;
fillColor=#FAFAFA;strokeColor=#F0F0F0;arcSize=4;dashed=1;dashPattern=4 4;"
vertex="1" parent="1">
  <mxGeometry x="248" y="278" width="652" height="286" as="geometry"/>
</mxCell>
<!-- 图表说明文字 -->
<mxCell id="chart_1_desc" value="（折线图表区域 — 销售趋势）" style="text;html=1;
strokeColor=none;fillColor=none;align=center;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=12;fontColor=#BFBFBF;"
vertex="1" parent="1">
  <mxGeometry x="400" y="410" width="348" height="22" as="geometry"/>
</mxCell>
```

### 16. 分页 (Pagination)

**JSON**: `table.pagination`

```xml
<mxCell id="page_1" value="共 100 条    &lt;  1  2  3  ...  10  &gt;    10条/页"
  style="text;html=1;strokeColor=none;fillColor=none;
  align=right;verticalAlign=middle;whiteSpace=wrap;rounded=0;
  fontSize=12;fontColor=#595959;" vertex="1" parent="1">
  <mxGeometry x="800" y="650" width="592" height="22" as="geometry"/>
</mxCell>
```

### 17. 标签/徽标 (Tag)

**JSON**: `type: "tag"`

```xml
<!-- 蓝色标签 -->
<mxCell id="tag_1" value="进行中" style="rounded=1;whiteSpace=wrap;html=1;
fillColor=#E6F7FF;strokeColor=#91D5FF;fontColor=#1890FF;
fontSize=11;arcSize=8;" vertex="1" parent="1">
  <mxGeometry x="500" y="150" width="56" height="22" as="geometry"/>
</mxCell>

<!-- 绿色标签 -->
<mxCell id="tag_2" value="已完成" style="rounded=1;whiteSpace=wrap;html=1;
fillColor=#F6FFED;strokeColor=#B7EB8F;fontColor=#52C41A;
fontSize=11;arcSize=8;" vertex="1" parent="1">
  <mxGeometry x="564" y="150" width="56" height="22" as="geometry"/>
</mxCell>

<!-- 红色标签 -->
<mxCell id="tag_3" value="已关闭" style="rounded=1;whiteSpace=wrap;html=1;
fillColor=#FFF1F0;strokeColor=#FFA39E;fontColor=#FF4D4F;
fontSize=11;arcSize=8;" vertex="1" parent="1">
  <mxGeometry x="628" y="150" width="56" height="22" as="geometry"/>
</mxCell>

<!-- 橙色标签 -->
<mxCell id="tag_4" value="警告" style="rounded=1;whiteSpace=wrap;html=1;
fillColor=#FFF7E6;strokeColor=#FFD591;fontColor=#FAAD14;
fontSize=11;arcSize=8;" vertex="1" parent="1">
  <mxGeometry x="692" y="150" width="44" height="22" as="geometry"/>
</mxCell>
```

### 18. 头像 (Avatar)

**JSON**: `type: "avatar"`

```xml
<mxCell id="avt_1" value="U" style="ellipse;whiteSpace=wrap;html=1;
fillColor=#1890FF;strokeColor=#1890FF;fontColor=#FFFFFF;
fontSize=14;fontStyle=1;" vertex="1" parent="1">
  <mxGeometry x="1384" y="8" width="32" height="32" as="geometry"/>
</mxCell>
```

### 19. 文本 (Text)

**JSON**: `type: "text"`

```xml
<!-- 标题 -->
<mxCell id="txt_title" value="页面标题" style="text;html=1;
strokeColor=none;fillColor=none;align=left;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=16;fontColor=#262626;fontStyle=1;"
vertex="1" parent="1">
  <mxGeometry x="224" y="76" width="300" height="24" as="geometry"/>
</mxCell>

<!-- 正文 -->
<mxCell id="txt_body" value="一段正文内容" style="text;html=1;
strokeColor=none;fillColor=none;align=left;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=13;fontColor=#595959;"
vertex="1" parent="1">
  <mxGeometry x="224" y="120" width="300" height="20" as="geometry"/>
</mxCell>

<!-- 辅助文字 -->
<mxCell id="txt_secondary" value="辅助说明" style="text;html=1;
strokeColor=none;fillColor=none;align=left;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=12;fontColor=#8C8C8C;"
vertex="1" parent="1">
  <mxGeometry x="224" y="148" width="300" height="18" as="geometry"/>
</mxCell>
```

### 20. 通知条目 (Notification Item)

**JSON**: `type: "notification-item"`

```xml
<mxCell id="notif_1" value="" style="rounded=0;whiteSpace=wrap;html=1;
fillColor=#FFFFFF;strokeColor=#F0F0F0;" vertex="1" parent="1">
  <mxGeometry x="248" y="150" width="1144" height="64" as="geometry"/>
</mxCell>
<!-- 未读圆点 -->
<mxCell id="notif_1_dot" value="" style="ellipse;whiteSpace=wrap;html=1;
fillColor=#1890FF;strokeColor=#1890FF;" vertex="1" parent="1">
  <mxGeometry x="264" y="176" width="8" height="8" as="geometry"/>
</mxCell>
<!-- 标题 -->
<mxCell id="notif_1_title" value="系统通知" style="text;html=1;
strokeColor=none;fillColor=none;align=left;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=13;fontColor=#262626;fontStyle=1;"
vertex="1" parent="1">
  <mxGeometry x="284" y="160" width="300" height="20" as="geometry"/>
</mxCell>
<!-- 时间 -->
<mxCell id="notif_1_time" value="5分钟前" style="text;html=1;
strokeColor=none;fillColor=none;align=right;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=12;fontColor=#8C8C8C;"
vertex="1" parent="1">
  <mxGeometry x="1200" y="160" width="168" height="20" as="geometry"/>
</mxCell>
<!-- 内容 -->
<mxCell id="notif_1_content" value="您有一条新的消息需要处理" style="text;html=1;
strokeColor=none;fillColor=none;align=left;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=12;fontColor=#595959;"
vertex="1" parent="1">
  <mxGeometry x="284" y="184" width="1084" height="18" as="geometry"/>
</mxCell>
```

### 21. 空状态 (Empty State)

用于通知页、列表空状态等场景。

```xml
<!-- 空状态插图区域 -->
<mxCell id="empty_icon" value="📋" style="text;html=1;
strokeColor=none;fillColor=none;align=center;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=48;fontColor=#D9D9D9;"
vertex="1" parent="1">
  <mxGeometry x="600" y="280" width="240" height="60" as="geometry"/>
</mxCell>
<!-- 空状态文字 -->
<mxCell id="empty_text" value="暂无数据" style="text;html=1;
strokeColor=none;fillColor=none;align=center;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=14;fontColor=#BFBFBF;"
vertex="1" parent="1">
  <mxGeometry x="600" y="350" width="240" height="24" as="geometry"/>
</mxCell>
```

### 22. 异常页 (Exception Page)

用于 403、404、500 等错误页面。

```xml
<!-- 异常代码 -->
<mxCell id="err_code" value="404" style="text;html=1;
strokeColor=none;fillColor=none;align=center;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=72;fontColor=#434E59;fontStyle=1;"
vertex="1" parent="1">
  <mxGeometry x="520" y="160" width="400" height="80" as="geometry"/>
</mxCell>
<!-- 异常描述 -->
<mxCell id="err_desc" value="抱歉，你访问的页面不存在" style="text;html=1;
strokeColor=none;fillColor=none;align=center;verticalAlign=middle;
whiteSpace=wrap;rounded=0;fontSize=14;fontColor=#8C8C8C;"
vertex="1" parent="1">
  <mxGeometry x="520" y="250" width="400" height="24" as="geometry"/>
</mxCell>
<!-- 返回按钮 -->
<mxCell id="err_btn" value="返回首页" style="rounded=1;whiteSpace=wrap;html=1;
fillColor=#1890FF;strokeColor=#1890FF;fontColor=#FFFFFF;
fontSize=13;arcSize=12;" vertex="1" parent="1">
  <mxGeometry x="656" y="300" width="128" height="40" as="geometry"/>
</mxCell>
```

---

## 坐标快速参考

| 组件 | 宽度 | 高度 | 备注 |
|------|------|------|------|
| 侧边栏 | 200 | canvas.height | |
| 顶栏 | canvas.width-200(或全宽) | 48 | |
| Logo | 152 | 32 | |
| 菜单项 | 200 | 40 | |
| 卡片 width | content.width - 48 | 自适应 | 左右各 24px 内边距 |
| 统计卡片 | (content.width-48-48)/4 | 134-140 | 4个一行，gap=16 |
| 按钮 default | 80 | 32 | |
| 按钮 large | 128 | 40 | |
| 输入框标签 | 80-120 | 20 | |
| 输入框 | 200-400 | 32 | |
| Textarea | 200-400 | 80 | |
| 选择器 | 150-400 | 32 | |
| 表格行 | 自适应 | 40 | |
| 标签 Tag | 44-80 | 22 | |
| 步骤圆点 | 24 | 24 | |
| 步骤间距 | 20 (圆点) / 176 (段宽) | | 800 / N |
| 头像 | 32 | 32 | |
| Tab 选项卡 | 80 | 30 | |
| 分页 | 自适应 | 22 | |
| 空状态图标 | 240 | 60 | |
| 异常页代码 | 400 | 80 | fontSize=72 |
| 分隔线 | 自适应 | 1 | |
| 登录卡片 | 380 | 420-480 | |
| 登录按钮 | 332 | 40 | |

## 间距参考

| 场景 | 间距 |
|------|------|
| 卡片内边距 | 24px |
| 卡片间距 | 16px |
| 组件垂直间距 | 16px |
| 组件水平间距 | 16px |
| 标签与输入框间距 | 8-12px |
| 按钮间间距 | 8px |
| 统计卡片间距 | 16px |
| 菜单项间距 | 0 (紧贴) |
