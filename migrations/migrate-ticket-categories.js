import dotenv from 'dotenv'
import mongoose from 'mongoose'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const ticketCategoryMigrations = Object.freeze({
	inspection: 'maintenance',
	upgrade: 'diagnosis',
	modification: 'diagnosis',
})

export function migratedTicketCategory(category) {
	return (
		ticketCategoryMigrations[
			String(category || '')
				.trim()
				.toLowerCase()
		] || category
	)
}

export async function runTicketCategoryMigration({ dryRun = false } = {}) {
	dotenv.config({ path: path.join(__dirname, '..', '.env'), override: true })
	if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required')

	await mongoose.connect(process.env.MONGO_URI)
	try {
		const collection = mongoose.connection.collection('TicketsCollection')
		const counts = Object.fromEntries(
			await Promise.all(
				Object.keys(ticketCategoryMigrations).map(async (category) => [
					category,
					await collection.countDocuments({
						service_category: category,
					}),
				]),
			),
		)
		const candidateCount = Object.values(counts).reduce(
			(total, count) => total + count,
			0,
		)

		const countSummary = Object.entries(counts)
			.map(([category, count]) => `${count} ${category}`)
			.join(', ')
		console.log(
			`Found ${candidateCount} ticket(s) to migrate (${countSummary}).`,
		)
		if (dryRun) {
			console.log('Dry run complete. No tickets were changed.')
			return { candidateCount, modifiedCount: 0, counts }
		}

		let modifiedCount = 0
		for (const [from, to] of Object.entries(ticketCategoryMigrations)) {
			const result = await collection.updateMany(
				{ service_category: from },
				{ $set: { service_category: to } },
			)
			modifiedCount += result.modifiedCount
		}

		console.log(`Migrated ${modifiedCount} ticket(s).`)
		return { candidateCount, modifiedCount, counts }
	} finally {
		await mongoose.disconnect()
	}
}

if (path.resolve(process.argv[1] || '') === __filename) {
	runTicketCategoryMigration({
		dryRun: process.argv.includes('--dry-run'),
	}).catch((error) => {
		console.error(error.message)
		process.exitCode = 1
	})
}
