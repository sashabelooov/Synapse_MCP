import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { UI_HOST, UI_PORT } from './config.js'
import apiRouter from './api/routes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()

app.use(cors())
app.use(express.json())

// API routes
app.use('/api', apiRouter)

// Serve built React frontend
const frontendDist = path.resolve(__dirname, '../web_ui/frontend/dist')
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'))
  })
} else {
  app.get('/', (_req, res) => {
    res.json({ status: 'Synapse MCP API running', note: 'Build the frontend with: npm run build:frontend' })
  })
}

app.listen(UI_PORT, UI_HOST, () => {
  console.log(`Synapse MCP server running at http://${UI_HOST}:${UI_PORT}`)
})
