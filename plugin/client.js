// 会话成本预警器 —— Client 半区（code.client）
// 部署方式：通过 DSH 的 cordis_define 将本文件内容粘贴到 code.client，再 cordis_run 激活。
// 本文件是纯 JavaScript 函数体：返回一个 Cordis Plugin，UI 用 React.createElement（无 JSX）。

return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    styles.insert(`
      .dsw-cost-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 2147483000;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 16px;
        background: var(--dsw-alias-bg-overlay, #ffffff);
        color: var(--dsw-alias-label-primary, #1a1a1a);
        border-bottom: 1px solid var(--dsw-alias-state-warn-primary, #f59e0b);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
        font-size: 13px;
        line-height: 1.4;
        pointer-events: auto;
        animation: dsw-cost-slide 0.25s ease-out;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      }
      .dsw-cost-banner-icon {
        color: var(--dsw-alias-state-warn-primary, #f59e0b);
        font-size: 16px;
        flex: none;
      }
      .dsw-cost-banner-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
      }
      .dsw-cost-banner-sub {
        color: var(--dsw-alias-label-secondary, #666666);
        font-size: 12px;
      }
      .dsw-cost-banner-close {
        border: none;
        background: transparent;
        color: var(--dsw-alias-label-secondary, #666666);
        cursor: pointer;
        font-size: 14px;
        padding: 4px 8px;
        border-radius: 4px;
        flex: none;
      }
      .dsw-cost-banner-close:hover {
        background: var(--dsw-alias-bg-layer-2, #eeeeee);
        color: var(--dsw-alias-label-primary, #1a1a1a);
      }
      @keyframes dsw-cost-slide {
        from { transform: translateY(-100%); }
        to { transform: translateY(0); }
      }
    `)

    const THRESHOLD = 1
    const AUTO_HIDE_MS = 5000
    const FALLBACK_PRICE = { input: 2, cacheRead: 0.5, cacheWrite: 2, output: 8 }

    function computeCost(usage, price) {
      if (!usage || !price) return 0
      const m = 1e6
      return (usage.uncachedInputTokens || 0) / m * price.input
        + (usage.cacheReadTokens || 0) / m * price.cacheRead
        + (usage.cacheWriteTokens || 0) / m * price.cacheWrite
        + (usage.outputTokens || 0) / m * price.output
    }

    function formatBalance(balance) {
      if (!balance || typeof balance.total !== 'number') return null
      const cur = balance.currency === 'CNY' ? '¥' : (balance.currency ? balance.currency + ' ' : '')
      let s = '账户余额 ' + cur + balance.total.toFixed(2)
      if (typeof balance.toppedUp === 'number' && balance.toppedUp > 0) {
        s += '（充值 ' + cur + balance.toppedUp.toFixed(2) + '）'
      }
      return s
    }

    function CostBanner(props) {
      const current = props.useSessions((s) => s.current)
      const usage = props.useSessions((s) => {
        if (!s.current) return null
        const summary = s.byId[s.current]
        if (!summary || !summary.projectionValues) return null
        return summary.projectionValues.tokenUsage || null
      })
      const [pricing, setPricing] = React.useState(null)
      const [balance, setBalance] = React.useState(null)
      const [visible, setVisible] = React.useState(false)
      const wasOver = React.useRef(false)
      const hideTimer = React.useRef(null)

      // 价格：5 秒刷新；余额：30 秒刷新
      React.useEffect(() => {
        let alive = true
        const refreshPrice = () => {
          host.call('cost/price', {}).then((res) => {
            if (!alive || !res || typeof res !== 'object') return
            if (res.price && typeof res.price === 'object') {
              setPricing({
                provider: typeof res.provider === 'string' ? res.provider : '',
                model: typeof res.model === 'string' ? res.model : '',
                price: res.price,
              })
            }
          }).catch(() => {})
        }
        const refreshBalance = () => {
          host.call('cost/balance', {}).then((res) => {
            if (alive && res && typeof res === 'object') setBalance(res)
          }).catch(() => {})
        }
        refreshPrice()
        refreshBalance()
        const stopPrice = ctx.interval(refreshPrice, 5000)
        const stopBalance = ctx.interval(refreshBalance, 30000)
        return () => { alive = false; stopPrice(); stopBalance() }
      }, [])

      const price = pricing ? pricing.price : FALLBACK_PRICE
      const cost = computeCost(usage, price)
      const over = cost > THRESHOLD

      // 边沿触发：花费从 <= 阈值 变为 > 阈值 时弹出，停留 5 秒后自动隐藏
      React.useEffect(() => {
        if (over && !wasOver.current) {
          if (hideTimer.current) { hideTimer.current(); hideTimer.current = null }
          setVisible(true)
          hideTimer.current = ctx.timeout(() => {
            hideTimer.current = null
            setVisible(false)
          }, AUTO_HIDE_MS)
        }
        wasOver.current = over
      }, [over])

      // 组件卸载时清理计时器
      React.useEffect(() => () => {
        if (hideTimer.current) hideTimer.current()
      }, [])

      if (!current || !visible) return null

      const dismiss = () => {
        if (hideTimer.current) { hideTimer.current(); hideTimer.current = null }
        setVisible(false)
      }

      const modelLabel = pricing && pricing.model ? pricing.model : '当前模型'
      const balanceLine = formatBalance(balance)
      return React.createElement('div', { className: 'dsw-cost-banner', role: 'alert' },
        React.createElement('span', { className: 'dsw-cost-banner-icon' }, '⚠'),
        React.createElement('span', { className: 'dsw-cost-banner-text' },
          React.createElement('strong', null, '本会话累计花费 ¥' + cost.toFixed(2)),
          React.createElement('span', { className: 'dsw-cost-banner-sub' },
            '已超过 ¥' + THRESHOLD + ' 预警线 · ' + modelLabel
          ),
          balanceLine === null ? null : React.createElement('span', { className: 'dsw-cost-banner-sub' }, balanceLine)
        ),
        React.createElement('button', {
          className: 'dsw-cost-banner-close',
          onClick: dismiss,
          'aria-label': '关闭',
        }, '✕')
      )
    }

    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'cost-banner' },
      (props) => React.createElement(CostBanner, props)
    ))
  },
}
