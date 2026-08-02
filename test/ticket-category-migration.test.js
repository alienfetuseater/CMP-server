import assert from 'node:assert/strict'
import test from 'node:test'
import {
	migratedTicketCategory,
	ticketCategoryMigrations,
} from '../migrations/migrate-ticket-categories.js'

test('maps retired ticket categories to supported categories', () => {
	assert.deepEqual(ticketCategoryMigrations, {
		inspection: 'maintenance',
		upgrade: 'diagnosis',
		modification: 'diagnosis',
	})
	assert.equal(migratedTicketCategory('inspection'), 'maintenance')
	assert.equal(migratedTicketCategory('UPGRADE'), 'diagnosis')
	assert.equal(migratedTicketCategory('modification'), 'diagnosis')
	assert.equal(migratedTicketCategory('repair'), 'repair')
})
