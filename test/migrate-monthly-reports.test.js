import assert from 'node:assert/strict'
import test from 'node:test'
import {
	buildMonthlyReportMigrationUpdate,
	isValidDateOnly,
	normalizeMonthlyReportDiagnostics,
	resolveMonthlyReportDate,
	retiredMonthlyReportFields,
} from '../migrations/migrate-monthly-reports.js'

test('validates real date-only values', () => {
	assert.equal(isValidDateOnly('2026-07-31'), true)
	assert.equal(isValidDateOnly('2026-02-30'), false)
	assert.equal(isValidDateOnly('07/31/2026'), false)
})

test('converts a legacy report month to the first day', () => {
	assert.equal(
		resolveMonthlyReportDate({ id: 'mr-1', reportMonth: '2026-07' }),
		'2026-07-01',
	)
})

test('preserves an existing valid report date on rerun', () => {
	assert.equal(
		resolveMonthlyReportDate({ id: 'mr-1', reportDate: '2026-07-15' }),
		'2026-07-15',
	)
})

test('builds a permanent unset for every retired field', () => {
	const update = buildMonthlyReportMigrationUpdate({
		id: 'mr-1',
		reportMonth: '2026-07',
	})

	assert.equal(update.$set.reportDate, '2026-07-01')
	assert.deepEqual(update.$set.diagnostics.engine_oil, {
		value: 'N/A',
		comment: '',
		photos: [],
	})
	assert.deepEqual(
		Object.keys(update.$unset).sort(),
		[...retiredMonthlyReportFields].sort(),
	)
})

test('converts flat diagnostics and preserves enriched entries', () => {
	const photo = {
		id: 'photo-1',
		name: 'Oil sample',
		uploadedAt: '2026-07-31T12:00:00.000Z',
		dataUrl: 'data:image/jpeg;base64,abc',
	}
	const diagnostics = normalizeMonthlyReportDiagnostics({
		engine_oil: 'monitor',
		gear_lube: { value: 'good', comment: 'Clean', photos: [photo] },
	})

	assert.deepEqual(diagnostics.engine_oil, {
		value: 'monitor',
		comment: '',
		photos: [],
	})
	assert.deepEqual(diagnostics.gear_lube, {
		value: 'good',
		comment: 'Clean',
		photos: [photo],
	})
})

test('rejects malformed legacy month values', () => {
	assert.throws(
		() =>
			resolveMonthlyReportDate({ id: 'mr-1', reportMonth: 'July 2026' }),
		/no valid report date or month/,
	)
})
