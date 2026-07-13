import express from 'express'
import CMPRoutes from './routes/routes.js'
import { errorHandler } from './middleware/error.js'
import { dbConnection } from './middleware/dbConnection.js'
import dotenv from 'dotenv'
dotenv.config()
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

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api/CMPGarage', CMPRoutes)

app.use(errorHandler)

app.listen(port, (req, res) => {
	console.log(`server running on port ${port}`)
})
