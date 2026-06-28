import { createHashHistory, createRootRoute, createRoute, createRouter, useParams } from '@tanstack/react-router'
import { BotId } from './bots'
import Layout from './components/Layout'
import MultiBotChatPanel from './pages/MultiBotChatPanel'
import SettingPage from './pages/SettingPage'
import SingleBotChatPanel from './pages/SingleBotChatPanel'

const rootRoute = createRootRoute()

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  component: Layout,
  id: 'layout',
})

const indexRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/',
  component: MultiBotChatPanel,
})

function ChatRoute() {
  const { botId } = useParams({ from: chatRoute.id })
  return <SingleBotChatPanel botId={botId as BotId} />
}

const chatRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'chat/$botId',
  component: ChatRoute,
})

const settingRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'setting',
  component: SettingPage,
})

const routeTree = rootRoute.addChildren([layoutRoute.addChildren([indexRoute, chatRoute, settingRoute])])

const hashHistory = createHashHistory()
const router = createRouter({ routeTree, history: hashHistory })

export { router }
