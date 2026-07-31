import dotenv from 'dotenv'
import mongoose from 'mongoose'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const retiredMonthlyReportFields = [
	'reportMonth',
	'service_title',
	'service_category',
	'status',
	'priority',
	'initialAssessment',
	'initialAssessmentPhotos',
	'recommendedService',
	'summaryOfWorkPerformed',
	'summaryOfWorkPerformedPhotos',
	'laborCost',
	'summaryOfFurtherRecommendations',
	'planOfAction',
	'requiredParts',
]

export function isValidDateOnly(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
	const [year, month, day] = value.split('-').map(Number)
	const date = new Date(Date.UTC(year, month - 1, day))
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	)
}

export function resolveMonthlyReportDate(report) {
	if (isValidDateOnly(report.reportDate)) return report.reportDate
	const reportMonth = String(report.reportMonth || '')
	if (!/^\d{4}-\d{2}$/.test(reportMonth)) {
		throw new Error(
			`Report ${report.id || report._id} has no valid report date or month`,
		)
	}
	const candidate = `${reportMonth}-01`
	if (!isValidDateOnly(candidate)) {
		throw new Error(
			`Report ${report.id || report._id} has invalid report month ${reportMonth}`,
		)
	}
	return candidate
}

export function buildMonthlyReportMigrationUpdate(report) {
	return {
		$set: { reportDate: resolveMonthlyReportDate(report) },
		$unset: Object.fromEntries(
			retiredMonthlyReportFields.map((field) => [field, '']),
		),
	}
}

const candidateFilter = {
	$or: [
		{ reportDate: { $exists: false } },
		...retiredMonthlyReportFields.map((field) => ({
			[field]: { $exists: true },
		})),
	],
}

async function validateCandidates(collection) {
	let count = 0
	for await (const report of collection.find(candidateFilter)) {
		buildMonthlyReportMigrationUpdate(report)
		count += 1
	}
	return count
}

async function applyMigration(collection) {
	let operations = []
	let modifiedCount = 0

	for await (const report of collection.find(candidateFilter)) {
		operations.push({
			updateOne: {
				filter: { _id: report._id },
				update: buildMonthlyReportMigrationUpdate(report),
			},
		})

		if (operations.length === 500) {
			const result = await collection.bulkWrite(operations, {
				ordered: false,
			})
			modifiedCount += result.modifiedCount
			operations = []
		}
	}

	if (operations.length) {
		const result = await collection.bulkWrite(operations, {
			ordered: false,
		})
		modifiedCount += result.modifiedCount
	}

	for (const indexName of ['reportMonth_1', 'status_1_createdAt_-1']) {
		await collection.dropIndex(indexName).catch((error) => {
			if (error.codeName !== 'IndexNotFound') throw error
		})
	}
	await collection.createIndex({ reportDate: -1 })

	return modifiedCount
}

export async function runMonthlyReportMigration({ dryRun = false } = {}) {
	dotenv.config({ path: path.join(__dirname, '..', '.env'), override: true })
	if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required')

	await mongoose.connect(process.env.MONGO_URI)
	try {
		const collection = mongoose.connection.collection(
			'MonthlyReportsCollection',
		)
		const candidateCount = await validateCandidates(collection)
		console.log(`Validated ${candidateCount} monthly report(s).`)
		if (dryRun) {
			console.log('Dry run complete. No records or indexes were changed.')
			return { candidateCount, modifiedCount: 0 }
		}
		const modifiedCount = await applyMigration(collection)
		console.log(`Migrated ${modifiedCount} monthly report(s).`)
		return { candidateCount, modifiedCount }
	} finally {
		await mongoose.disconnect()
	}
}

if (path.resolve(process.argv[1] || '') === __filename) {
	runMonthlyReportMigration({
		dryRun: process.argv.includes('--dry-run'),
	}).catch((error) => {
		console.error(error.message)
		process.exitCode = 1
	})
}
