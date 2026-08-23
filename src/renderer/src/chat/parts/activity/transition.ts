/**
 * 活动行展开/收起的过渡曲线。
 *
 * 取自 Codex `app-initial` 里的共享常量(源码 `Qj`),`tool-activity-disclosure`
 * 与会话里所有 `motion.div` 高度动画都用它:
 *
 *     Qj = { duration: 300 / 1e3, ease: [0.19, 1, 0.22, 1] }
 *
 * 同一处还定义了 `Zj = [0.23, 1, 0.32, 1]`(chip 入场用)和
 * `{ duration: 150/1e3, ease: Zj }`,但展开动画走的是上面这条 —— 别混用。
 */
import type { Transition } from 'framer-motion'

export const DISCLOSURE_TRANSITION: Transition = {
  duration: 0.3,
  ease: [0.19, 1, 0.22, 1]
}
