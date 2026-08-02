import assert from 'node:assert/strict'
import test from 'node:test'
import { getUserAssignedTickets } from '../controllers.js/controllers.js'
import { Ticket, User } from '../models/models.js'

const createResponse = () => ({
	statusCode: 200,
	body: null,
	status(code) {
		this.statusCode = code
		return this
	},
	json(body) {
		this.body = body
		return this
	},
})

test('lists compact tickets assigned to the selected registered user', async (context) => {
	const originalUserFindOne = User.findOne
	const originalTicketFind = Ticket.find
	let ticketQuery

	User.findOne = () => ({
		select: async () => ({ id: 'user-2' }),
	})
	Ticket.find = (query) => {
		ticketQuery = query
		const chain = {
			select: () => chain,
			sort: () => chain,
			lean: async () => [
				{
					id: 'ticket-1',
					service_title: 'Replace raw-water pump',
					service_category: 'repair',
					status: 'in progress',
					priority: 'high',
					scheduledDate: '2026-08-05T12:00:00.000Z',
				},
			],
		}
		return chain
	}
	context.after(() => {
		User.findOne = originalUserFindOne
		Ticket.find = originalTicketFind
	})

	const response = createResponse()
	await getUserAssignedTickets({ params: { id: 'user-2' } }, response)

	assert.deepEqual(ticketQuery, { assignedUserId: 'user-2' })
	assert.equal(response.statusCode, 200)
	assert.deepEqual(response.body, [
		{
			id: 'ticket-1',
			title: 'Replace raw-water pump',
			category: 'repair',
			status: 'in progress',
			priority: 'high',
			scheduledDate: '2026-08-05T12:00:00.000Z',
		},
	])
})
