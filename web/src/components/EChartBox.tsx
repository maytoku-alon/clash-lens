import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

interface EChartBoxProps {
  option: echarts.EChartsCoreOption
  className?: string
  onChartReady?: (chart: echarts.ECharts) => void
}

export function EChartBox({ option, className = 'h-[280px] w-full', onChartReady }: EChartBoxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const chart = echarts.init(el, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    onChartReady?.(chart)

    let rafId = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        chartRef.current?.resize()
      })
    })
    ro.observe(el)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      chart.dispose()
      chartRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setOption(option, { notMerge: true, lazyUpdate: true })
    }
  }, [option])

  return <div ref={containerRef} className={className} />
}
