import jwt from 'jsonwebtoken'

const normalizeText = (value) => {
	if (value === undefined || value === null) return ''
	return String(value).trim()
}

const getSecret = () => {
	const secret = normalizeText(process.env.JWT_SECRET)
	if (!secret) {
		throw new Error('JWT_SECRET is not configured on the server')
	}
	return secret
}

export const createAuthToken = (payload) => {
	const expiresIn = normalizeText(process.env.JWT_EXPIRES_IN) || '7d'
	return jwt.sign(payload, getSecret(), { expiresIn })
}

export const verifyAuthToken = (token) => jwt.verify(token, getSecret())

export const requireAuth = (req, res, next) => {
	try {
		const header = normalizeText(req.headers.authorization)
		if (!header || !header.startsWith('Bearer ')) {
			return res.status(401).json({ error: 'Authentication required' })
		}

		const token = header.slice('Bearer '.length).trim()
		if (!token) {
			return res.status(401).json({ error: 'Authentication required' })
		}

		const decoded = verifyAuthToken(token)
		req.authUser = decoded
		next()
	} catch {
		return res.status(401).json({ error: 'Invalid or expired token' })
	}
}
