import express from 'express'
import CMPRoutes from './routes/routes.js'
import { errorHandler } from './middleware/error.js'
import { dbConnection } from './middleware/dbConnection.js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '.env'), override: true })
const port = process.env.PORT || 8000

dbConnection()

const app = express()
import cors from 'cors'

app.use(
	cors({
		origin: 'http://localhost:5173', // Allow requests from this origin
		methods: ['GET', 'POST', 'PUT', 'DELETE'], // Specify allowed methods
		allowedHeaders: ['Content-Type', 'Authorization'], // Specify allowed headers
	}),
)

app.use(express.json({ limit: '25mb' }))
app.use(express.urlencoded({ limit: '25mb', extended: true }))

app.use('/api/CMPGarage', CMPRoutes)

app.use(errorHandler)

app.listen(port, (req, res) => {
	console.log(`server running on port ${port}`)
})
