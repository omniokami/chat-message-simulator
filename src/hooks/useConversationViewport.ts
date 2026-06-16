import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { clamp } from "@/utils/helpers"

export interface ConversationViewportMetrics {
  contentHeight: number
  viewportHeight: number
  fullExportHeight: number
  hasOverflow: boolean
}

interface UseConversationViewportOptions {
  width: number
  height: number
  zoom: number
  autoFit: boolean
  measurementKey?: string
}

export interface ConversationViewportState {
  containerRef: RefObject<HTMLDivElement | null>
  scrollRef: RefObject<HTMLDivElement | null>
  exportRef: RefObject<HTMLDivElement | null>
  conversationContainerRef: RefObject<HTMLDivElement | null>
  conversationContentRef: RefObject<HTMLDivElement | null>
  metrics: ConversationViewportMetrics
  appliedScale: number
  scaledWidth: number
  scaledHeight: number
  screenScrollTops: number[]
  screenCount: number
  getViewportOffset: () => { x: number; y: number }
  scrollConversation: (position: "top" | "bottom") => void
}

const defaultMetrics: ConversationViewportMetrics = {
  contentHeight: 0,
  viewportHeight: 0,
  fullExportHeight: 0,
  hasOverflow: false,
}

export const useConversationViewport = ({
  width,
  height,
  zoom,
  autoFit,
  measurementKey,
}: UseConversationViewportOptions): ConversationViewportState => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const exportRef = useRef<HTMLDivElement | null>(null)
  const conversationContainerRef = useRef<HTMLDivElement | null>(null)
  const conversationContentRef = useRef<HTMLDivElement | null>(null)
  const [fitScale, setFitScale] = useState(1)
  const [metrics, setMetrics] = useState<ConversationViewportMetrics>(defaultMetrics)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateScale = () => {
      const rect = element.getBoundingClientRect()
      const styles = window.getComputedStyle(element)
      const paddingX =
        parseFloat(styles.paddingLeft || "0") + parseFloat(styles.paddingRight || "0")
      const paddingY =
        parseFloat(styles.paddingTop || "0") + parseFloat(styles.paddingBottom || "0")
      const availableWidth = rect.width - paddingX
      const availableHeight = rect.height - paddingY
      if (!availableWidth || !availableHeight) return
      const scaleX = availableWidth / width
      const scaleY = availableHeight / height
      const nextScale = Math.min(scaleX, scaleY, 1)
      setFitScale(nextScale > 0 ? nextScale : 1)
    }

    const raf = requestAnimationFrame(updateScale)
    const observer = new ResizeObserver(() => requestAnimationFrame(updateScale))
    observer.observe(element)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [height, width, autoFit, measurementKey])

  useEffect(() => {
    const container = conversationContainerRef.current
    const content = conversationContentRef.current
    const exportElement = exportRef.current
    if (!container || !content || !exportElement) return

    let frame = 0
    const measureConversation = () => {
      frame = 0
      const viewportHeight = container.clientHeight
      if (!viewportHeight) return
      const contentHeight = Math.ceil(Math.max(content.scrollHeight, content.offsetHeight))
      const chromeHeight = Math.max(0, exportElement.clientHeight - viewportHeight)
      const fullExportHeight = Math.max(height, Math.ceil(chromeHeight + contentHeight))
      const hasOverflow = contentHeight > viewportHeight + 1
      setMetrics((previous) => {
        if (
          previous.contentHeight === contentHeight &&
          previous.viewportHeight === viewportHeight &&
          previous.fullExportHeight === fullExportHeight &&
          previous.hasOverflow === hasOverflow
        ) {
          return previous
        }
        return {
          contentHeight,
          viewportHeight,
          fullExportHeight,
          hasOverflow,
        }
      })
    }
    const scheduleMeasure = () => {
      if (frame) {
        cancelAnimationFrame(frame)
      }
      frame = requestAnimationFrame(measureConversation)
    }

    scheduleMeasure()

    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(container)
    observer.observe(content)
    observer.observe(exportElement)

    const images = Array.from(content.querySelectorAll("img"))
    images.forEach((image) => {
      image.addEventListener("load", scheduleMeasure)
      image.addEventListener("error", scheduleMeasure)
    })

    return () => {
      if (frame) {
        cancelAnimationFrame(frame)
      }
      observer.disconnect()
      images.forEach((image) => {
        image.removeEventListener("load", scheduleMeasure)
        image.removeEventListener("error", scheduleMeasure)
      })
    }
  }, [height, measurementKey, width])

  const appliedScale = clamp((autoFit ? fitScale : 1) * zoom, 0.1, 2)
  const scaledWidth = width * appliedScale
  const scaledHeight = height * appliedScale

  const screenScrollTops = useMemo(() => {
    const viewportHeight = Math.round(metrics.viewportHeight)
    const contentHeight = Math.round(metrics.contentHeight)
    if (!viewportHeight || !contentHeight) {
      return [0]
    }

    const maxScroll = Math.max(0, contentHeight - viewportHeight)
    if (maxScroll === 0) {
      return [0]
    }

    const positions: number[] = []
    for (let top = 0; top < maxScroll; top += viewportHeight) {
      positions.push(top)
    }
    if (positions[positions.length - 1] !== maxScroll) {
      positions.push(maxScroll)
    }
    return positions
  }, [metrics.contentHeight, metrics.viewportHeight])

  const getViewportOffset = useCallback(() => {
    const scrollElement = scrollRef.current
    const exportElement = exportRef.current
    if (!scrollElement || !exportElement || appliedScale === 0) {
      return { x: 0, y: 0 }
    }
    const scrollRect = scrollElement.getBoundingClientRect()
    const exportRect = exportElement.getBoundingClientRect()
    const deltaX = scrollRect.left - exportRect.left
    const deltaY = scrollRect.top - exportRect.top
    const rawX = deltaX / appliedScale
    const rawY = deltaY / appliedScale
    const viewWidth = scrollElement.clientWidth / appliedScale
    const viewHeight = scrollElement.clientHeight / appliedScale
    const maxX = Math.max(0, width - viewWidth)
    const maxY = Math.max(0, height - viewHeight)
    const offsetX = clamp(rawX, 0, maxX)
    const offsetY = clamp(rawY, 0, maxY)
    return {
      x: Number.isFinite(offsetX) ? offsetX : 0,
      y: Number.isFinite(offsetY) ? offsetY : 0,
    }
  }, [appliedScale, height, width])

  const scrollConversation = useCallback((position: "top" | "bottom") => {
    const container = conversationContainerRef.current
    if (!container) return
    container.scrollTo({
      top: position === "top" ? 0 : container.scrollHeight,
      behavior: "smooth",
    })
  }, [])

  return {
    containerRef,
    scrollRef,
    exportRef,
    conversationContainerRef,
    conversationContentRef,
    metrics,
    appliedScale,
    scaledWidth,
    scaledHeight,
    screenScrollTops,
    screenCount: Math.max(screenScrollTops.length, 1),
    getViewportOffset,
    scrollConversation,
  }
}
