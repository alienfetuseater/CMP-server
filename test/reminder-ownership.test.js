import assert from 'node:assert/strict'
import test from 'node:test'
import {
	deleteReminder,
	getAllReminders,
	newReminder,
	updateReminder,
} from '../controllers.js/controllers.js'
import { Reminder } from '../models/models.js'

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

const authUser = {
	userId: 'user-1',
	role: 'technician',
}

test('lists only reminders created by the authenticated user', async (context) => {
	const originalFind = Reminder.find
	let query
	Reminder.find = (value) => {
		query = value
		return { sort: async () => [] }
	}
	context.after(() => {
		Reminder.find = originalFind
	})

	const response = createResponse()
	await getAllReminders({ authUser }, response)

	assert.deepEqual(query, {
		$and: [{}, { createdByUserId: 'user-1' }],
	})
	assert.equal(response.statusCode, 200)
})

test('sets reminder ownership from authentication instead of request data', async (context) => {
	const originalCreate = Reminder.create
	let createdRecord
	Reminder.create = async (value) => {
		createdRecord = value
		return value
	}
	context.after(() => {
		Reminder.create = originalCreate
	})

	const response = createResponse()
	await newReminder(
		{
			authUser,
			body: {
				title: 'My reminder',
				createdByUserId: 'spoofed-user',
			},
		},
		response,
	)

	assert.equal(createdRecord.createdByUserId, 'user-1')
	assert.equal(response.statusCode, 201)
})

test('scopes reminder updates to the creator and strips ownership changes', async (context) => {
	const originalUpdate = Reminder.findOneAndUpdate
	let query
	let updates
	Reminder.findOneAndUpdate = async (queryValue, updateValue) => {
		query = queryValue
		updates = updateValue
		return { id: 'reminder-1', ...updateValue }
	}
	context.after(() => {
		Reminder.findOneAndUpdate = originalUpdate
	})

	const response = createResponse()
	await updateReminder(
		{
			authUser,
			params: { id: 'reminder-1' },
			body: {
				title: 'Updated reminder',
				createdByUserId: 'user-2',
			},
		},
		response,
	)

	assert.deepEqual(query, {
		$and: [{ id: 'reminder-1' }, { createdByUserId: 'user-1' }],
	})
	assert.deepEqual(updates, { title: 'Updated reminder' })
	assert.equal(response.statusCode, 200)
})

test('scopes reminder deletion to the creator', async (context) => {
	const originalDelete = Reminder.findOneAndDelete
	let query
	Reminder.findOneAndDelete = async (value) => {
		query = value
		return { id: 'reminder-1' }
	}
	context.after(() => {
		Reminder.findOneAndDelete = originalDelete
	})

	const response = createResponse()
	await deleteReminder({ authUser, params: { id: 'reminder-1' } }, response)

	assert.deepEqual(query, {
		$and: [{ id: 'reminder-1' }, { createdByUserId: 'user-1' }],
	})
	assert.equal(response.statusCode, 200)
})
