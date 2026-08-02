import assert from 'node:assert/strict'
import test from 'node:test'
import { getAssignmentBoard } from '../controllers.js/controllers.js'
import { MonthlyReport, Reminder, Ticket } from '../models/models.js'

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

const queryChain = (records) => {
	const chain = {
		select: () => chain,
		sort: () => chain,
		lean: async () => records,
	}
	return chain
}

test('returns diagnosis work and creator-owned reminders on the assignment board', async (context) => {
	const originalTicketFind = Ticket.find
	const originalReportFind = MonthlyReport.find
	const originalReminderFind = Reminder.find
	let reminderQuery

	Ticket.find = () =>
		queryChain([
			{
				id: 'ticket-1',
				service_category: 'modification',
				service_title: 'Trace intermittent alarm',
				initialAssessment: 'Alarm occurs under load.',
			},
		])
	MonthlyReport.find = () => queryChain([])
	Reminder.find = (query) => {
		reminderQuery = query
		return queryChain([
			{
				id: 'reminder-1',
				title: 'Call owner',
				notes: 'Review diagnosis before ordering parts.',
			},
		])
	}
	context.after(() => {
		Ticket.find = originalTicketFind
		MonthlyReport.find = originalReportFind
		Reminder.find = originalReminderFind
	})

	const response = createResponse()
	await getAssignmentBoard(
		{ authUser: { role: 'admin', userId: 'user-1' } },
		response,
	)

	assert.deepEqual(reminderQuery, {
		$and: [{ completed: false }, { createdByUserId: 'user-1' }],
	})
	assert.equal(response.statusCode, 200)
	assert.equal(response.body.scope, 'all')
	assert.equal(response.body.tickets[0].category, 'diagnosis')
	assert.deepEqual(response.body.reminders, [
		{
			id: 'reminder-1',
			kind: 'reminder',
			category: 'reminder',
			title: 'Call owner',
			synopsis: 'Review diagnosis before ordering parts.',
		},
	])
})
