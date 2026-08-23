import { HomeHero } from '../components/home/HomeHero'
import { HomeSuggestions } from '../components/home/HomeSuggestions'
import { Composer } from '../components/composer/Composer'

/**
 * 首页 —— 层级逐层照 Codex 实测(New chat 状态下的 MainContentFrame 内部)。
 *
 * 整体是**流式**布局,没有一个绝对定位的坐标:
 *
 *   (上面两层路由容器 div.relative.min-h-0.flex-1 > div.h-full.min-h-0 归 MainContentLayout)
 *   div.@container/left-panel.relative.flex.h-full.min-h-0.flex-col
 *   └ div.[container-type:size].[container-name:home-main-content]…overflow-y-auto   ← 滚动容器
 *     ├ div.mx-auto.w-full.max-w-(--thread-content-max-width).px-toolbar
 *     │ └ div.home-banners…empty:hidden.pt-2                                        ← 横幅槽(常空)
 *     └ div.min-h-0.w-full.flex-1.pt-6.flex.flex-col
 *       ├ div.flex.grow.basis-0.items-end.justify-center.pb-24.min-h-fit            ← 上半区
 *       │ └ div.relative.mx-auto.flex.w-[min(100%,var(--thread-content-max-width))]…px-panel
 *       │   ├ div.flex.min-h-28.w-full.items-end.justify-center   → HomeHero
 *       │   └ div.absolute.inset-x-[…suggestion-inline-inset].top-full.mt-8  → HomeSuggestions
 *       └ div.flex.min-w-0.shrink-0.grow.basis-0.flex-col.min-h-fit.justify-end     ← 下半区
 *         ├ div.mx-auto…flex.min-w-0.flex-col.gap-2.-mt-16 > [data-home-ambient-suggestions]
 *         └ div.relative.z-20.pt-1.5.pb-4 > div.mx-auto…flex.flex-col.gap-2 > Composer
 *
 * 机制上要理解的三点:
 *
 * 1. **两个 `grow basis-0` 半区**把可用高度对半分,各自 `min-h-fit` 保底。
 *    上半 `items-end` 让 hero 贴着分界线往上排,下半 `justify-end` 让 composer 贴底。
 *    窗口变高时 hero 和 composer 一起往中间靠 —— 这是绝对定位做不出来的。
 * 2. **建议卡是 hero 的 `absolute` 兄弟**(`top-full mt-8`),挂在 hero 那层
 *    `relative` 容器上。所以卡片位置永远跟着 hero 走,不需要知道 hero 有多高。
 * 3. 宽度全程走 token:`--thread-content-max-width`(48rem) + `px-toolbar` / `px-panel`,
 *    没有 714px / 738px 这类硬编码。之前那套像素定位(top-[289px] / top-[433px] /
 *    bottom-[15px])是原型稿的遗留,窗口一变就散。
 */
export function HomeView(): React.JSX.Element {
  return (
    <div className="@container/left-panel relative flex h-full min-h-0 flex-col">
      <div className="[container-type:size] relative flex min-h-0 w-full flex-1 flex-col [container-name:home-main-content] overflow-y-auto [&:has([data-feature='game-surface'])_[data-feature='game-source']]:invisible [scrollbar-gutter:stable_both-edges]">
        <div className="mx-auto w-full max-w-(--thread-content-max-width) px-toolbar">
          <div className="home-banners flex w-full min-w-0 flex-col gap-2 empty:hidden pt-2" />
        </div>
        <div className="min-h-0 w-full flex-1 pt-6 flex flex-col">
          {/* 上半区 —— hero + 建议卡 */}
          <div className="flex grow basis-0 items-end justify-center pb-24 min-h-fit">
            <div className="relative mx-auto flex w-[min(100%,var(--thread-content-max-width))] min-w-0 justify-center px-panel">
              <div className="flex min-h-28 w-full items-end justify-center">
                <HomeHero />
              </div>
              <div className="absolute inset-x-[var(--composer-suggestion-inline-inset)] top-full mt-8 min-w-0">
                <HomeSuggestions />
              </div>
            </div>
          </div>
          {/* 下半区 —— ambient 建议槽 + composer */}
          <div className="flex min-w-0 shrink-0 grow basis-0 flex-col min-h-fit justify-end">
            <div className="mx-auto w-full max-w-(--thread-content-max-width) px-toolbar flex min-w-0 flex-col gap-2 -mt-16">
              <div
                data-home-ambient-suggestions="true"
                className="ms-[calc(var(--composer-suggestion-inline-inset)-var(--composer-inline-overhang))] me-[calc(var(--composer-suggestion-inline-inset)+var(--composer-inline-overhang))] h-fit min-h-0 min-w-0"
              />
            </div>
            <div className="relative z-20 pt-1.5 pb-4">
              <div className="mx-auto w-full max-w-(--thread-content-max-width) px-toolbar flex flex-col gap-2">
                <div className="ms-[calc(var(--composer-suggestion-inline-inset)-var(--composer-inline-overhang))] me-[calc(var(--composer-suggestion-inline-inset)+var(--composer-inline-overhang))] min-w-0" />
                <div className="empty:hidden electron:mx-[var(--home-composer-inline-inset)]" />
                <Composer placement="home" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
