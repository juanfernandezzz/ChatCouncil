import { createRoot } from 'react-dom/client'
import './i18n'
import SidePanelPage from './pages/SidePanelPage'
import './base.scss'
import './sidepanel.css'

const container = document.getElementById('app')!
const root = createRoot(container)
root.render(<SidePanelPage />)
