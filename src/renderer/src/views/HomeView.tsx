import { Hero } from '../components/home/Hero'
import { SuggestionCards } from '../components/home/SuggestionCards'
import { Composer } from '../components/composer/Composer'

/** 首页视图（对应 prototype/1.html 的主区域），渲染在 ContentArea 中 */
export function HomeView(): React.JSX.Element {
  return (
    <>
      <Hero />
      <SuggestionCards />
      <Composer />
    </>
  )
}
