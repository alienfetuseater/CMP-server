import assert from 'node:assert/strict'
import test from 'node:test'
import {
	hasPermission,
	isUserRole,
	normalizeUserRole,
} from '../domain/auth/roles.js'

test('admin identity permissions are not granted to service managers', () => {
	assert.equal(hasPermission('admin', 'users:create'), true)
	assert.equal(hasPermission('admin', 'settings:manage'), true)
	assert.equal(hasPermission('serviceManager', 'users:create'), false)
	assert.equal(hasPermission('serviceManager', 'settings:manage'), false)
	assert.equal(hasPermission('serviceManager', 'records:delete'), true)
})

test('technicians cannot view the calendar', () => {
	assert.equal(hasPermission('technician', 'calendar:view'), false)
	assert.equal(hasPermission('technician', 'reports:update'), true)
})

test('legacy users normalize without receiving administrator privileges', () => {
	assert.equal(normalizeUserRole('user'), 'serviceManager')
	assert.equal(hasPermission('user', 'users:create'), false)
	assert.equal(isUserRole('user'), false)
})