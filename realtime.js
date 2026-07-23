import { Server } from 'socket.io'
import { verifyAuthToken } from './middleware/auth.js'

let io = null

const normalizeText = (value) => {
	if (value === undefined || value === null) return ''
	return String(value).trim()
}

const roomForUser = (userId) => `user:${normalizeText(userId)}`

export const initializeRealtimeServer = (httpServer) => {
	io = new Server(httpServer, {
		cors: {
			origin: 'http://localhost:5173',
			methods: ['GET', 'POST'],
			allowedHeaders: ['Authorization'],
		},
	})

	io.use((socket, next) => {
		try {
			const rawToken =
				normalizeText(socket.handshake.auth?.token) ||
				normalizeText(socket.handshake.headers.authorization).replace(
					/^Bearer\s+/i,
					'',
				)

			if (!rawToken) {
				return next(new Error('Authentication required'))
			}

			const decoded = verifyAuthToken(rawToken)
			socket.authUser = decoded
			return next()
		} catch {
			return next(new Error('Invalid or expired token'))
		}
	})

	io.on('connection', (socket) => {
		const userId = normalizeText(socket.authUser?.userId)
		if (userId) {
			socket.join(roomForUser(userId))
		}
	})

	return io
}

export const emitConversationUpdated = (conversation, targetUserIds = []) => {
	if (!io || !conversation) return

	Array.from(
		new Set(
			targetUserIds.map((entry) => normalizeText(entry)).filter(Boolean),
		),
	).forEach((userId) => {
		io.to(roomForUser(userId)).emit('conversation:updated', conversation)
	})
}

export const emitConversationUpdatedToAll = (conversation) => {
	if (!io || !conversation) return
	io.emit('conversation:updated', conversation)
}
