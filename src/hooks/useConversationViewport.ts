import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefCallback,
  type RefObject,
} from "react"
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
  maxFitScale?: number
  maxAppliedScale?: number
  measurementKey?: string
}

export interface ConversationViewportState {
  containerRef: RefCallback<HTMLDivElement>
  scrollRef: RefCallback<HTMLDivElement>
  exportRef: RefCallback<HTMLDivElement>
  exportElementRef: RefObject<HTMLDivElement | null>
  conversationContainerRef: RefCallback<HTMLDivElement>
  conversationContentRef: RefCallback<HTMLDivElement>
  metrics: ConversationViewportMetrics
  appliedScale: number
  scaledWidth: number
  scaledHeight: number
  hasLongConversation: boolean
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
  maxFitScale = 1,
  maxAppliedScale = 2,
  measurementKey,
}: UseConversationViewportOptions): ConversationViewportState => {
  const containerElementRef = useRef<HTMLDivElement | null>(null)
  const scrollElementRef = useRef<HTMLDivElement | null>(null)
  const exportElementRef = useRef<HTMLDivElement | null>(null)
  const conversationContainerElementRef = useRef<HTMLDivElement | null>(null)
  const conversationContentElementRef = useRef<HTMLDivElement | null>(null)
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null)
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const [exportElement, setExportElement] = useState<HTMLDivElement | null>(null)
  const [conversationContainerElement, setConversationContainerElement] =
    useState<HTMLDivElement | null>(null)
  const [conversationContentElement, setConversationContentElement] =
    useState<HTMLDivElement | null>(null)
  const [fitScale, setFitScale] = useState(1)
  const [metrics, setMetrics] = useState<ConversationViewportMetrics>(defaultMetrics)

  const containerRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
    containerElementRef.current = node
    setContainerElement((current) => (current === node ? current : node))
  }, [])
  const scrollRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
    scrollElementRef.current = node
    setScrollElement((current) => (current === node ? current : node))
  }, [])
  const exportRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
    exportElementRef.current = node
    setExportElement((current) => (current === node ? current : node))
  }, [])
  const conversationContainerRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
    conversationContainerElementRef.current = node
    setConversationContainerElement((current) => (current === node ? current : node))
  }, [])
  const conversationContentRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
    conversationContentElementRef.current = node
    setConversationContentElement((current) => (current === node ? current : node))
  }, [])

  useLayoutEffect(() => {
    const element = scrollElement ?? containerElement
    if (!element) return

    let frame = 0
    const updateScale = () => {
      frame = 0
      const rect = element.getBoundingClientRect()
      const availableWidth = element.clientWidth || rect.width
      const availableHeight = element.clientHeight || rect.height
      if (!availableWidth || !availableHeight) return
      const scaleX = availableWidth / width
      const scaleY = availableHeight / height
      const nextScale = Math.min(scaleX, scaleY, maxFitScale)
      const normalizedScale = nextScale > 0 ? nextScale : 1
      setFitScale((current) => (current === normalizedScale ? current : normalizedScale))
    }
    const scheduleUpdateScale = () => {
      if (frame) {
        cancelAnimationFrame(frame)
      }
      frame = requestAnimationFrame(updateScale)
    }

    updateScale()
    const observer = new ResizeObserver(scheduleUpdateScale)
    observer.observe(element)
    window.addEventListener("resize", scheduleUpdateScale)
    window.visualViewport?.addEventListener("resize", scheduleUpdateScale)

    return () => {
      if (frame) {
        cancelAnimationFrame(frame)
      }
      observer.disconnect()
      window.removeEventListener("resize", scheduleUpdateScale)
      window.visualViewport?.removeEventListener("resize", scheduleUpdateScale)
    }
  }, [height, width, autoFit, maxFitScale, measurementKey, containerElement, scrollElement])

  useEffect(() => {
    const container = conversationContainerElement
    const content = conversationContentElement
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

    content.addEventListener("load", scheduleMeasure, true)
    content.addEventListener("error", scheduleMeasure, true)

    return () => {
      if (frame) {
        cancelAnimationFrame(frame)
      }
      observer.disconnect()
      content.removeEventListener("load", scheduleMeasure, true)
      content.removeEventListener("error", scheduleMeasure, true)
    }
  }, [
    conversationContainerElement,
    conversationContentElement,
    exportElement,
    height,
    measurementKey,
    width,
  ])

  const appliedScale = clamp((autoFit ? fitScale : 1) * zoom, 0.1, maxAppliedScale)
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
  const hasLongConversation = screenScrollTops.length > 1

  const getViewportOffset = useCallback(() => {
    const scrollElement = scrollElementRef.current
    const exportElement = exportElementRef.current
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
    const container = conversationContainerElementRef.current
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
    exportElementRef,
    conversationContainerRef,
    conversationContentRef,
    metrics,
    appliedScale,
    scaledWidth,
    scaledHeight,
    hasLongConversation,
    screenScrollTops,
    screenCount: Math.max(screenScrollTops.length, 1),
    getViewportOffset,
    scrollConversation,
  }
}
