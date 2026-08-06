import assert from 'node:assert/strict'
import test from 'node:test'
import { getWorkspaceAccess } from '../controllers.js/controllers.js'

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

test('reports server-authoritative monthly report capabilities by role', () => {
	const adminResponse = createResponse()
	getWorkspaceAccess({ authUser: { role: 'admin' } }, adminResponse)
	assert.equal(adminResponse.body.canCreateReports, true)
	assert.equal(adminResponse.body.canUpdateReports, true)
	assert.equal(adminResponse.body.canUnlockReports, true)

	const coordinatorResponse = createResponse()
	getWorkspaceAccess(
		{ authUser: { role: 'coordinator' } },
		coordinatorResponse,
	)
	assert.equal(coordinatorResponse.body.canCreateReports, true)
	assert.equal(coordinatorResponse.body.canUpdateReports, true)
	assert.equal(coordinatorResponse.body.canUnlockReports, false)

	const technicianResponse = createResponse()
	getWorkspaceAccess({ authUser: { role: 'technician' } }, technicianResponse)
	assert.equal(technicianResponse.body.canCreateReports, false)
	assert.equal(technicianResponse.body.canUpdateReports, true)
	assert.equal(technicianResponse.body.canUnlockReports, false)
})
