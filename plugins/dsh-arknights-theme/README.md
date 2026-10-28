# dsh-arknights-theme

明日方舟风格的 DSH Web 界面皮肤与开场动画。纯注入实现，没有客户端 bundle、没有运行时依赖。

## 装载

在 profile 的 `--patch` overlay 中加一行（路径为绝对路径）：

```yaml
- insert:
    - id: arknights-theme
      name: '<REPO>/plugins/dsh-arknights-theme/src/index.ts'
```

插件声明 `inject = ['webServer']`，只在 Web 组装中存在；CLI 或 headless profile 不会加载它。

## 它注入什么

每次渲染 index 时，插件向 `webserver/index-inject` 推送 5 行：

| 行 | 内容 |
| --- | --- |
| `style` | `theme.css`：`--dsw-alias-*` 语义 token 覆写（暖石墨 + 琥珀金）、切角圆角、字体、扫描线 |
| `style` | `splash.css`：开场动画的全部样式 |
| `html`（body） | `splash.html`：覆盖层结构 |
| `script`（body） | `splash.js`：日志 / 进度 / 跳过 / 自我保护 |
| `html`（body） | 常驻 HUD：四角细金边与左下角状态条 |

## 开场动画

时间轴：0.1s 横向金色光束 → 0.18s 六边形徽标描边 → 0.55s 英文引导语 → 0.62s 标题遮罩展开 → 1.05s 起终端自检日志与进度条 → 2.58s 上收式揭幕 → 3.36s 移除节点。

- 点击 / 按键任意处跳过；
- `prefers-reduced-motion: reduce` 时直接进入静态完成态，0.7s 后退场；
- CSS 自带 4.6s 故障保护（`visibility: hidden` + `pointer-events: none`），脚本异常也不会锁住界面；
- URL 带 `nosplash` 参数时直接跳过，便于截图与自动化。

## 改样式时的三条硬约束

1. **注入文本里不能出现 `<body`、`<head`、`<html` 字面量。** DSH 组装 index 时按这些标记定位插入点；在 CSS 注释里写一个 `<body>`，body 行就会被拼进注释，整页解析错位。`src/index.ts` 在加载时自检并抛出明确错误。
2. **token 覆写要用 `html:root body ... !important`。** 运行时主题表在插件之后注入，社区背景插件同样用 `!important` 覆写同一批变量，权重不够就会被覆盖。
3. **开场动画样式必须留在 `splash.css`。** 注入的 HTML 片段里如果内嵌 `<style>`，解析器会把它重定位到 head，覆盖层会被拆散。

## 几何背景

背景不是图片，而是画出来的：`GEO_HTML` + `theme.css` 的 `.ak-geo*` 规则组成六层——

| 层 | 做法 |
| --- | --- |
| 暗角 | `radial-gradient` 压住四周，中心留亮 |
| 技术网格 | 88px 双向细线，径向遮罩只在边缘显形 |
| 斜切排线 | 右上角 56vw 区块，45° 排线 + 线性遮罩 |
| 网点 | 左下角 11px 圆点阵列，径向遮罩 |
| 斜向金线 | 140vw 长线，`rotate(-23deg)` 贯穿画面 |
| 多边形 | 右上六边形（含 160s 缓慢自转的菱形）与左下三角标尺，内联 SVG 描边 |

全部由 CSS 渐变或内联 SVG 生成，没有任何图片请求；`prefers-reduced-motion` 下停止自转。

## 与背景插件共存

profile 里如果装过立绘类背景插件（会往 body 铺图片、并注入 `[data-dab-wp*]` 图层），本皮肤默认**抑制这些图层**，只显示自己的几何图面——否则立绘会盖住网格与多边形。

需要恢复立绘时，删掉 `theme.css` 里这三段即可：

```css
html:root body { background-image: ... !important; }
[data-dab-wp], [data-dab-wp-layer] { display: none !important; }
html:root body::before { content: none !important; }
```

在裸装 DSH 上无需任何配置，同一组数值直接呈现为深色几何终端。
