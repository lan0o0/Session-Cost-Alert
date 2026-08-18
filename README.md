#  DeepSeek Harness 会话成本预警器 (Session Cost Alert)

> 一个基于 **DeepSeek Harness / Cordis** 的动态插件：实时估算**单次会话**的累计花费，一旦超过 **¥1** 就在界面顶部弹出横幅提醒，停留 **5 秒**后自动隐藏，并同步显示 DeepSeek 账户的**充值余额**。

---

## 项目简介

在使用大模型 Agent（如 DeepSeek Harness）时，会话消耗的 token 费用是逐轮累积的，用户往往等到月底账单出来才发现超支。本项目提供一种**低成本、零侵入**的实时成本感知方案：

- 插件部署后无需任何配置，自动跟踪**当前会话**的 token 用量投影（Host 实时推送）；
- 按当前模型对应的单价（内置价格表）估算累计花费；
- 花费跨越预警线（默认 ¥1）的**瞬间**在界面顶部弹出横幅；
- 横幅 5 秒后自动消失，不打断工作流，可手动提前关闭；
- 顺带展示 DeepSeek 开放平台的账户余额，花费与余额一眼可见。

> ⚠️ 花费为**估算值**（系统不提供定价，由内置价格表折算），实际扣费以 DeepSeek 开放平台账单为准。

---

## 功能特性

| 特性 | 说明 |
| --- | --- |
| 🚨 阈值触发横幅 | 花费从 ≤¥1 变为 >¥1 的瞬间，顶部滑入横幅提醒 |
| ⏱️ 5 秒自动隐藏 | 停留 5 秒自动消失，也可点 ✕ 提前关闭；再次跨线重新弹出 |
| 💰 账户余额显示 | 横幅内同时显示账户总额与充值金额（CNY） |
| 🔄 实时刷新 | 模型价格每 5s 刷新，余额每 30s 刷新 |
| 🔒 Key 安全 | API Key 只留在 Host 进程内（子进程 env），绝不下发浏览器 |
| 🎨 主题适配 | 使用 DSH 主题 CSS 变量，自动适配明暗主题 |
| 🧩 零侵入 | 注册到 `shell.overlay` 附加槽位，不替换任何现有 UI |

---

## 效果示意

当会话花费超过 ¥1 时，界面顶部出现：

```
┌────────────────────────────────────────────────────────────┐
│ ⚠ 本会话累计花费 ¥1.23                                      │
│   已超过 ¥1 预警线 · deepseek-v4-flash                      │
│   账户余额 ¥39.64（充值 ¥39.64）                     [✕]    │
└────────────────────────────────────────────────────────────┘
（5 秒后自动隐藏）
```

---

## 工作原理

```
┌─ Client (浏览器) ─────────────────────────────────────────┐
│ shell.overlay 槽位注册横幅组件                             │
│  · useSessions → 当前会话 projectionValues.tokenUsage      │
│    （Host 实时推送的累计 token 用量投影）                   │
│  · 花费 = Σ(各桶 token / 1e6 × 单价)                       │
│  · host.call('cost/price')   每 5s  取当前模型单价          │
│  · host.call('cost/balance') 每 30s 取账户余额              │
└───────────────┬────────────────────────────────────────────┘
                │ Package-private JSON RPC (host.call)
┌───────────────▼────────────────────────────────────────────┐
│ Host (DSH 进程)                                            │
│  · cost/price:   agentDefaultModel.currentSelection()      │
│                  → 内置价格表查价（未知模型回退默认价）      │
│  · cost/balance: credentials.resolve('DEEPSEEK_API_KEY')   │
│                  → shell(curl) 请求                        │
│                    https://api.deepseek.com/user/balance   │
└────────────────────────────────────────────────────────────┘
```

---

## 文件结构

```
trea_18/
├── README.md          # 项目介绍（本文件）
├── package.json       # 项目元信息 + npm run check 语法校验
└── plugin/
    ├── host.js        # 插件 Host 半区源码（code.host）
    └── client.js      # 插件 Client 半区源码（code.client）
```

---

## 快速开始（部署）

本插件是 DSH 的**动态 Cordis 插件**，通过 Harness 界面的 `cordis_define` + `cordis_run` 部署：

1. `cordis_define`（kind: new）时：
   - `code.host` ← `plugin/host.js` 的内容；
   - `code.client` ← `plugin/client.js` 的内容；
2. `cordis_run` 激活，并在界面批准 Client 包；
3. 生效：当前会话花费超过 ¥1 即弹出顶部横幅。

> 本地语法校验：`npm run check`（无第三方依赖）。

---

## 配置说明

代码顶部可直接调整的常量：

| 常量 | 默认值 | 说明 |
| --- | --- | --- |
| `THRESHOLD` | `1` | 花费预警阈值（元） |
| `AUTO_HIDE_MS` | `5000` | 横幅停留时长（毫秒） |
| `PRICES` | deepseek-chat / reasoner 两档 | 每百万 token 单价（人民币），按模型 id 查表 |
| `DEFAULT_PRICE` | 输入 ¥2 / 缓存命中 ¥0.5 / 输出 ¥8（每 M） | 未知模型回退价 |

---

## 注意事项

- **花费为估算值**：系统数据模型不提供定价，插件使用内置价格表折算；如需精确计价，请按 DeepSeek 官方最新价格调整 `PRICES`。
- **余额依赖 DeepSeek 提供方**：`/user/balance` 仅对 DeepSeek 公共 API（`api.deepseek.com`）可用；接口不可用或网络异常时自动降级，横幅只保留花费提醒。
- **API Key**：通过 `credentials.resolve('DEEPSEEK_API_KEY')` 解析，仅用于 Host 侧请求余额接口，不会写入浏览器、命令行或日志。

---

## License

本项目未指定开源许可证，保留所有权利。
