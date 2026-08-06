import assert from 'node:assert/strict'
import test from 'node:test'
import {
	hasPermission,
	isUserRole,
	normalizeUserRole,
} from '../domain/auth/roles.js'

test('service managers can register and view users without administering roles', () => {
	assert.equal(hasPermission('admin', 'users:create'), true)
	assert.equal(hasPermission('admin', 'settings:manage'), true)
	assert.equal(hasPermission('serviceManager', 'users:create'), true)
	assert.equal(hasPermission('serviceManager', 'users:read'), true)
	assert.equal(hasPermission('serviceManager', 'users:assignRole'), false)
	assert.equal(hasPermission('serviceManager', 'settings:manage'), false)
	assert.equal(hasPermission('serviceManager', 'records:delete'), true)
})

test('technicians cannot view the calendar', () => {
	assert.equal(hasPermission('technician', 'calendar:view'), false)
	assert.equal(hasPermission('technician', 'reports:update'), true)
	assert.equal(hasPermission('technician', 'reports:create'), false)
	assert.equal(hasPermission('technician', 'reminders:view'), true)
	assert.equal(hasPermission('technician', 'reminders:manage'), true)
	assert.equal(hasPermission('technician', 'customers:manage'), false)
	assert.equal(hasPermission('technician', 'directory:view'), false)
	assert.equal(hasPermission('viewer', 'reminders:view'), true)
	assert.equal(hasPermission('viewer', 'reminders:manage'), true)
	assert.equal(hasPermission('viewer', 'directory:view'), true)
})

test('only administrators, service managers, and coordinators can delegate assignments', () => {
	assert.equal(hasPermission('admin', 'assignments:delegate'), true)
	assert.equal(hasPermission('serviceManager', 'assignments:delegate'), true)
	assert.equal(hasPermission('coordinator', 'assignments:delegate'), true)
	assert.equal(hasPermission('technician', 'assignments:delegate'), false)
	assert.equal(hasPermission('viewer', 'assignments:delegate'), false)
})

test('staff responsible for monthly reports can update diagnostics', () => {
	assert.equal(hasPermission('admin', 'reports:manage'), true)
	assert.equal(hasPermission('serviceManager', 'reports:manage'), true)
	assert.equal(hasPermission('coordinator', 'reports:create'), true)
	assert.equal(hasPermission('coordinator', 'reports:update'), true)
	assert.equal(hasPermission('technician', 'reports:update'), true)
	assert.equal(hasPermission('viewer', 'reports:update'), false)
})

test('assignment board access excludes viewers', () => {
	assert.equal(hasPermission('admin', 'assignments:view'), true)
	assert.equal(hasPermission('serviceManager', 'assignments:view'), true)
	assert.equal(hasPermission('coordinator', 'assignments:view'), true)
	assert.equal(hasPermission('technician', 'assignments:view'), true)
	assert.equal(hasPermission('viewer', 'assignments:view'), false)
})

test('legacy users normalize without receiving administrator privileges', () => {
	assert.equal(normalizeUserRole('user'), 'serviceManager')
	assert.equal(hasPermission('user', 'users:create'), true)
	assert.equal(hasPermission('user', 'users:assignRole'), false)
	assert.equal(isUserRole('user'), false)
})
