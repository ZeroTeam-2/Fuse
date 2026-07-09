export default defineNuxtPlugin(() => {
  const metricaId = useRuntimeConfig().public.yandexMetricaId as string | undefined

  if (!metricaId) return

  const w = window as unknown as {
    ym?: (...args: unknown[]) => void
  }

  w.ym =
    w.ym ||
    function (...args: unknown[]) {
      const self = w.ym as unknown as { a?: unknown[][] }
      ;(self.a = self.a || []).push(args)
    }

  const script = document.createElement('script')
  script.async = true
  script.src = 'https://mc.yandex.ru/metrika/tag.js'
  const firstScript = document.getElementsByTagName('script')[0]
  firstScript?.parentNode?.insertBefore(script, firstScript)

  w.ym!(metricaId, 'init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
  })

  const noscript = document.createElement('noscript')
  const img = document.createElement('img')
  img.src = `https://mc.yandex.ru/watch/${metricaId}`
  img.style.cssText = 'position:absolute; left:-9999px;'
  img.alt = ''
  noscript.appendChild(img)
  document.body.appendChild(noscript)
})
