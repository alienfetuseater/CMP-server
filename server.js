const express = require('express')

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())

let items = [
	{ id: 1, name: 'Sample item', description: 'This is a demo item.' },
]

app.get('/health', (req, res) => {
	res.json({ status: 'ok' })
})

app.get('/api/items', (req, res) => {
	res.json(items)
})

app.post('/api/items', (req, res) => {
	const newItem = {
		id: Date.now(),
		name: req.body.name,
		description: req.body.description || '',
	}

	items.push(newItem)
	res.status(201).json(newItem)
})

app.put('/api/items/:id', (req, res) => {
	const itemId = Number(req.params.id)
	const item = items.find((entry) => entry.id === itemId)

	if (!item) {
		return res.status(404).json({ error: 'Item not found' })
	}

	item.name = req.body.name || item.name
	item.description = req.body.description || item.description

	res.json(item)
})

app.delete('/api/items/:id', (req, res) => {
	const itemId = Number(req.params.id)
	const initialLength = items.length

	items = items.filter((entry) => entry.id !== itemId)

	if (items.length === initialLength) {
		return res.status(404).json({ error: 'Item not found' })
	}

	res.status(204).send()
})

app.listen(PORT, () => {
	console.log(`Server listening on http://localhost:${PORT}`)
})
