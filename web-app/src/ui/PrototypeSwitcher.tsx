// THROWAWAY UI exploration control; excluded from production rendering.
import { useEffect } from 'react'
const prototypeVariants = ['A', 'B', 'C'] as const
export type PrototypeVariant = typeof prototypeVariants[number]
const names = { A: '时间轴对照', B: '事件排障', C: '实时盯盘' }
export function PrototypeSwitcher({ variant, onChange }: { variant: PrototypeVariant; onChange: (v: PrototypeVariant) => void }) {
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return
      e.preventDefault()
      onChange(prototypeVariants[(prototypeVariants.indexOf(variant) + (e.key === 'ArrowRight' ? 1 : 2)) % 3])
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [variant, onChange])
  if (!import.meta.env.DEV) return null
  return <div className="prototype-switcher" aria-label="原型方案切换">
    <button aria-label="上一个方案" onClick={() => onChange(prototypeVariants[(prototypeVariants.indexOf(variant) + 2) % 3])}>←</button>
    <span>设计原型 <b>{variant} · {names[variant]}</b></span>
    <button aria-label="下一个方案" onClick={() => onChange(prototypeVariants[(prototypeVariants.indexOf(variant) + 1) % 3])}>→</button>
  </div>
}
