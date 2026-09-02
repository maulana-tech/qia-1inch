import { useLayoutEffect, useRef, useCallback, type ReactNode } from 'react'
import Lenis from 'lenis'
import './ScrollStack.css'

// React Bits ScrollStack (JS+CSS variant), ported to TypeScript and hardened for
// window-scroll mode. Cards pin near the top of the viewport and scale/stack as
// you scroll. Visual styling lives on each ScrollStackItem via `itemClassName`;
// this file only drives the transforms.
//
// Window-mode fix: the upstream component reads card positions with
// getBoundingClientRect() every frame — but a pinned card already carries a
// transform, so the rect reflects the transformed position and the pin math
// feeds back on itself (jitter). Here we measure each card's *layout* top once
// (transforms stripped) into a cache and re-measure only on resize, so the
// per-frame math always uses a stable position.

export const ScrollStackItem = ({
  children,
  itemClassName = '',
}: {
  children: ReactNode
  itemClassName?: string
}) => <div className={`scroll-stack-card ${itemClassName}`.trim()}>{children}</div>

interface Transform {
  translateY: number
  scale: number
  rotation: number
  blur: number
}

interface ScrollStackProps {
  children: ReactNode
  className?: string
  itemDistance?: number
  itemScale?: number
  itemStackDistance?: number
  stackPosition?: string
  scaleEndPosition?: string
  baseScale?: number
  rotationAmount?: number
  blurAmount?: number
  useWindowScroll?: boolean
  onStackComplete?: () => void
}

const ScrollStack = ({
  children,
  className = '',
  itemDistance = 100,
  itemScale = 0.03,
  itemStackDistance = 30,
  stackPosition = '20%',
  scaleEndPosition = '10%',
  baseScale = 0.85,
  rotationAmount = 0,
  blurAmount = 0,
  useWindowScroll = false,
  onStackComplete,
}: ScrollStackProps) => {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const stackCompletedRef = useRef(false)
  const animationFrameRef = useRef<number | null>(null)
  const lenisRef = useRef<Lenis | null>(null)
  const cardsRef = useRef<HTMLElement[]>([])
  const cardTopsRef = useRef<number[]>([]) // cached layout tops (window mode)
  const endTopRef = useRef<number>(0)
  const lastTransformsRef = useRef(new Map<number, Transform>())
  const isUpdatingRef = useRef(false)

  const calculateProgress = useCallback((scrollTop: number, start: number, end: number) => {
    if (scrollTop < start) return 0
    if (scrollTop > end) return 1
    return (scrollTop - start) / (end - start)
  }, [])

  const parsePercentage = useCallback((value: string, containerHeight: number) => {
    if (typeof value === 'string' && value.includes('%')) {
      return (parseFloat(value) / 100) * containerHeight
    }
    return parseFloat(value)
  }, [])

  const getScrollData = useCallback(() => {
    if (useWindowScroll) {
      return { scrollTop: window.scrollY, containerHeight: window.innerHeight }
    }
    const scroller = scrollerRef.current
    return {
      scrollTop: scroller?.scrollTop ?? 0,
      containerHeight: scroller?.clientHeight ?? 0,
    }
  }, [useWindowScroll])

  /** Measure each card's document-relative *layout* top with transforms stripped,
   *  so pinning math never feeds back on an already-transformed rect. Cheap; runs
   *  at setup and on resize only. */
  const measurePositions = useCallback(() => {
    if (useWindowScroll) {
      const scrollTop = window.scrollY
      cardTopsRef.current = cardsRef.current.map((card) => {
        const prev = card.style.transform
        card.style.transform = 'none'
        const top = card.getBoundingClientRect().top + scrollTop
        card.style.transform = prev
        return top
      })
      const endEl = document.querySelector('.scroll-stack-end') as HTMLElement | null
      endTopRef.current = endEl ? endEl.getBoundingClientRect().top + scrollTop : 0
    } else {
      cardTopsRef.current = cardsRef.current.map((card) => card.offsetTop)
      const endEl = scrollerRef.current?.querySelector('.scroll-stack-end') as HTMLElement | null
      endTopRef.current = endEl?.offsetTop ?? 0
    }
  }, [useWindowScroll])

  const updateCardTransforms = useCallback(() => {
    if (!cardsRef.current.length || isUpdatingRef.current) return
    isUpdatingRef.current = true

    const { scrollTop, containerHeight } = getScrollData()
    const stackPositionPx = parsePercentage(stackPosition, containerHeight)
    const scaleEndPositionPx = parsePercentage(scaleEndPosition, containerHeight)
    const endElementTop = endTopRef.current

    cardsRef.current.forEach((card, i) => {
      if (!card) return

      const cardTop = cardTopsRef.current[i] ?? 0
      const triggerStart = cardTop - stackPositionPx - itemStackDistance * i
      const triggerEnd = cardTop - scaleEndPositionPx
      const pinStart = cardTop - stackPositionPx - itemStackDistance * i
      const pinEnd = endElementTop - containerHeight / 2

      const scaleProgress = calculateProgress(scrollTop, triggerStart, triggerEnd)
      const targetScale = baseScale + i * itemScale
      const scale = 1 - scaleProgress * (1 - targetScale)
      const rotation = rotationAmount ? i * rotationAmount * scaleProgress : 0

      let blur = 0
      if (blurAmount) {
        let topCardIndex = 0
        for (let j = 0; j < cardsRef.current.length; j++) {
          const jCardTop = cardTopsRef.current[j] ?? 0
          const jTriggerStart = jCardTop - stackPositionPx - itemStackDistance * j
          if (scrollTop >= jTriggerStart) topCardIndex = j
        }
        if (i < topCardIndex) blur = Math.max(0, (topCardIndex - i) * blurAmount)
      }

      let translateY = 0
      const isPinned = scrollTop >= pinStart && scrollTop <= pinEnd
      if (isPinned) {
        translateY = scrollTop - cardTop + stackPositionPx + itemStackDistance * i
      } else if (scrollTop > pinEnd) {
        translateY = pinEnd - cardTop + stackPositionPx + itemStackDistance * i
      }

      const newTransform: Transform = {
        translateY: Math.round(translateY * 100) / 100,
        scale: Math.round(scale * 1000) / 1000,
        rotation: Math.round(rotation * 100) / 100,
        blur: Math.round(blur * 100) / 100,
      }

      const lastTransform = lastTransformsRef.current.get(i)
      const hasChanged =
        !lastTransform ||
        Math.abs(lastTransform.translateY - newTransform.translateY) > 0.1 ||
        Math.abs(lastTransform.scale - newTransform.scale) > 0.001 ||
        Math.abs(lastTransform.rotation - newTransform.rotation) > 0.1 ||
        Math.abs(lastTransform.blur - newTransform.blur) > 0.1

      if (hasChanged) {
        card.style.transform = `translate3d(0, ${newTransform.translateY}px, 0) scale(${newTransform.scale}) rotate(${newTransform.rotation}deg)`
        card.style.filter = newTransform.blur > 0 ? `blur(${newTransform.blur}px)` : ''
        lastTransformsRef.current.set(i, newTransform)
      }

      if (i === cardsRef.current.length - 1) {
        const isInView = scrollTop >= pinStart && scrollTop <= pinEnd
        if (isInView && !stackCompletedRef.current) {
          stackCompletedRef.current = true
          onStackComplete?.()
        } else if (!isInView && stackCompletedRef.current) {
          stackCompletedRef.current = false
        }
      }
    })

    isUpdatingRef.current = false
  }, [
    itemScale,
    itemStackDistance,
    stackPosition,
    scaleEndPosition,
    baseScale,
    rotationAmount,
    blurAmount,
    onStackComplete,
    calculateProgress,
    parsePercentage,
    getScrollData,
  ])

  const handleScroll = useCallback(() => updateCardTransforms(), [updateCardTransforms])

  const setupLenis = useCallback(() => {
    const common = {
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 2,
      wheelMultiplier: 1,
      lerp: 0.08,
      syncTouch: true,
      syncTouchLerp: 0.075,
    }
    const scroller = scrollerRef.current
    const lenis = useWindowScroll
      ? new Lenis(common)
      : scroller
        ? new Lenis({ ...common, wrapper: scroller, content: scroller.querySelector('.scroll-stack-inner') as HTMLElement })
        : null
    if (!lenis) return
    lenis.on('scroll', handleScroll)
    const raf = (time: number) => {
      lenis.raf(time)
      animationFrameRef.current = requestAnimationFrame(raf)
    }
    animationFrameRef.current = requestAnimationFrame(raf)
    lenisRef.current = lenis
    return lenis
  }, [handleScroll, useWindowScroll])

  useLayoutEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    const scroller = scrollerRef.current
    if (!scroller) return

    const cards = Array.from(
      useWindowScroll
        ? document.querySelectorAll<HTMLElement>('.scroll-stack-card')
        : scroller.querySelectorAll<HTMLElement>('.scroll-stack-card'),
    )
    cardsRef.current = cards
    const transformsCache = lastTransformsRef.current

    cards.forEach((card, i) => {
      if (i < cards.length - 1) card.style.marginBottom = `${itemDistance}px`
      card.style.willChange = 'transform, filter'
      card.style.transformOrigin = 'top center'
      card.style.backfaceVisibility = 'hidden'
      card.style.transform = 'translateZ(0)'
      card.style.perspective = '1000px'
    })

    measurePositions()
    setupLenis()
    updateCardTransforms()

    // Re-measure on resize / late image load (offsets shift, then re-pin).
    const remeasure = () => {
      measurePositions()
      updateCardTransforms()
    }
    window.addEventListener('resize', remeasure)
    window.addEventListener('load', remeasure)

    return () => {
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('load', remeasure)
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      if (lenisRef.current) lenisRef.current.destroy()
      stackCompletedRef.current = false
      cardsRef.current = []
      cardTopsRef.current = []
      transformsCache.clear()
      isUpdatingRef.current = false
    }
  }, [
    itemDistance,
    itemScale,
    itemStackDistance,
    stackPosition,
    scaleEndPosition,
    baseScale,
    rotationAmount,
    blurAmount,
    useWindowScroll,
    onStackComplete,
    setupLenis,
    updateCardTransforms,
    measurePositions,
  ])

  return (
    <div className={`scroll-stack-scroller ${className}`.trim()} ref={scrollerRef}>
      <div className="scroll-stack-inner">
        {children}
        {/* Spacer so the last pin can release cleanly */}
        <div className="scroll-stack-end" />
      </div>
    </div>
  )
}

export default ScrollStack
