// 会话成本预警器 —— Host 半区（code.host）
// 部署方式：通过 DSH 的 cordis_define 将本文件内容粘贴到 code.host，再 cordis_run 激活。
// 本文件是纯 JavaScript 函数体：返回一个 Cordis Plugin。不使用 TS/JSX/import。

return {
  apply(ctx) {
    // 每百万 token 价格（人民币），键为模型 id；未知模型回退到默认价。
    const PRICES = {
      'deepseek-chat': { input: 2, cacheRead: 0.5, cacheWrite: 2, output: 8 },
      'deepseek-reasoner': { input: 4, cacheRead: 1, cacheWrite: 4, output: 16 },
    }
    const DEFAULT_PRICE = { input: 2, cacheRead: 0.5, cacheWrite: 2, output: 8 }

    ctx.effect(() => harness.handle('cost/price', async () => {
      let provider = ''
      let model = ''
      const agentDefaultModel = ctx.get('agentDefaultModel')
      if (agentDefaultModel !== undefined) {
        try {
          const sel = agentDefaultModel.currentSelection()
          if (sel && typeof sel === 'object') {
            provider = typeof sel.provider === 'string' ? sel.provider : ''
            model = typeof sel.model === 'string' ? sel.model : ''
          }
        } catch (err) {
          console.error('cost/price: currentSelection failed', err)
        }
      }
      const price = PRICES[model] || DEFAULT_PRICE
      return { provider, model, price }
    }))

    // 余额：用同一把 API Key 请求 DeepSeek 的 /user/balance 接口。
    // Key 只在本进程内解析并放进子进程 env，绝不发给浏览器。
    ctx.effect(() => harness.handle('cost/balance', async () => {
      try {
        const credentials = ctx.get('credentials')
        const shell = ctx.get('shell')
        if (credentials === undefined || shell === undefined) return null
        const resolved = await credentials.resolve('DEEPSEEK_API_KEY')
        if (!resolved || typeof resolved.value !== 'string' || resolved.value === '') return null
        const spec = shell.resolve({
          command: 'curl -sS -m 8 -H "Authorization: Bearer $DEEPSEEK_API_KEY" https://api.deepseek.com/user/balance',
          env: { DEEPSEEK_API_KEY: resolved.value },
          stdoutMaxBytes: 8192,
          timeoutMs: 10000,
        })
        const result = await shell.run(spec)
        if (result.exitCode !== 0) return null
        const text = result.stdout && typeof result.stdout.text === 'string' ? result.stdout.text : ''
        if (text === '') return null
        const parsed = JSON.parse(text)
        const infos = Array.isArray(parsed.balance_infos) ? parsed.balance_infos : []
        const entry = infos.find((i) => i && i.currency === 'CNY') || infos[0]
        if (!entry || typeof entry !== 'object') return null
        const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
        return {
          currency: typeof entry.currency === 'string' ? entry.currency : 'CNY',
          total: num(entry.total_balance),
          toppedUp: num(entry.topped_up_balance),
          granted: num(entry.granted_balance),
        }
      } catch (err) {
        console.error('cost/balance failed', err)
        return null
      }
    }))
  },
}
