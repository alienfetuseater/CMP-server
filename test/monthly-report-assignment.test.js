import assert from 'node:assert/strict'
import test from 'node:test'
import {
	newMonthlyReport,
	updateMonthlyReport,
} from '../controllers.js/controllers.js'
import { MonthlyReport, User } from '../models/models.js'

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

test('creates an assigned monthly report without update-only state', async (context) => {
	const originalFindOne = User.findOne
	const originalCreate = MonthlyReport.create
	let createdRecord

	User.findOne = (query) => {
		const user =
			query.id === 'admin-1'
				? { id: 'admin-1', role: 'admin' }
				: { id: 'tech-1', name: 'Taylor Tech', role: 'technician' }
		return { ...user, select: async () => user }
	}
	MonthlyReport.create = async (record) => {
		createdRecord = record
		return record
	}
	context.after(() => {
		User.findOne = originalFindOne
		MonthlyReport.create = originalCreate
	})

	const response = createResponse()
	await newMonthlyReport(
		{
			authUser: { userId: 'admin-1', role: 'admin' },
			body: {
				reportDate: '2026-08-02',
				assignedUserId: 'tech-1',
				diagnostics: { engine_oil: { value: 'good' } },
				notes: 'Should only be accepted after creation',
				markCompleted: true,
			},
		},
		response,
	)

	assert.equal(response.statusCode, 201)
	assert.equal(createdRecord.assignedUserId, 'tech-1')
	assert.equal(createdRecord.assignedUserName, 'Taylor Tech')
	assert.equal(createdRecord.diagnostics, undefined)
	assert.equal(createdRecord.notes, undefined)
	assert.equal(createdRecord.status, 'draft')
	assert.equal(createdRecord.isLocked, false)
})

test('prevents technicians from reassigning their monthly reports', async (context) => {
	const originalReportFindOne = MonthlyReport.findOne
	const originalReportUpdate = MonthlyReport.findOneAndUpdate
	const originalUserFindOne = User.findOne
	let updateCalled = false

	MonthlyReport.findOne = async () => ({
		id: 'report-1',
		assignedUserId: 'tech-1',
		isLocked: false,
	})
	MonthlyReport.findOneAndUpdate = async () => {
		updateCalled = true
		return null
	}
	User.findOne = () => ({
		select: async () => ({ id: 'tech-1', role: 'technician' }),
	})
	context.after(() => {
		MonthlyReport.findOne = originalReportFindOne
		MonthlyReport.findOneAndUpdate = originalReportUpdate
		User.findOne = originalUserFindOne
	})

	const response = createResponse()
	await updateMonthlyReport(
		{
			authUser: { userId: 'tech-1', role: 'technician' },
			params: { id: 'report-1' },
			body: { assignedUserId: 'tech-2' },
		},
		response,
	)

	assert.equal(response.statusCode, 403)
	assert.equal(
		response.body.error,
		'You do not have permission to delegate assignments',
	)
	assert.equal(updateCalled, false)
})

test('allows administrators to update diagnostics on unassigned reports', async (context) => {
	const originalReportFindOne = MonthlyReport.findOne
	const originalReportUpdate = MonthlyReport.findOneAndUpdate
	let updateQuery
	let updatePayload

	MonthlyReport.findOne = async (query) => {
		updateQuery = query
		return { id: 'report-1', assignedUserId: '', isLocked: false }
	}
	MonthlyReport.findOneAndUpdate = async (query, payload) => {
		updateQuery = query
		updatePayload = payload
		return { id: 'report-1', ...payload }
	}
	context.after(() => {
		MonthlyReport.findOne = originalReportFindOne
		MonthlyReport.findOneAndUpdate = originalReportUpdate
	})

	const response = createResponse()
	await updateMonthlyReport(
		{
			authUser: { userId: 'admin-1', role: 'admin' },
			params: { id: 'report-1' },
			body: { diagnostics: { engine_oil: { value: 'good' } } },
		},
		response,
	)

	assert.equal(response.statusCode, 200)
	assert.equal(Object.hasOwn(updateQuery, '$and'), false)
	assert.deepEqual(updatePayload.diagnostics, {
		engine_oil: { value: 'good' },
	})
})
