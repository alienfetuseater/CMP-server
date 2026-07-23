import { randomUUID } from 'crypto'
import mongoose from 'mongoose'
import nodemailer from 'nodemailer'
import PDFDocument from 'pdfkit'
import { Customer, Vessel, Ticket, Reminder } from '../models/models.js'

const sendError = (res, status, message) => {
	res.status(status).json({ error: message })
}

const buildRecord = (body, defaults = {}) => ({
	...defaults,
	...body,
	id: body.id || randomUUID(),
})

const toTicketQuery = (ticketId) =>
	mongoose.Types.ObjectId.isValid(ticketId)
		? { $or: [{ id: ticketId }, { _id: ticketId }] }
		: { id: ticketId }

const toEntityQuery = (entityId) =>
	mongoose.Types.ObjectId.isValid(entityId)
		? { $or: [{ id: entityId }, { _id: entityId }] }
		: { id: entityId }

const formatPdfDate = (value) => {
	if (!value) return 'N/A'
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return 'N/A'
	return date.toLocaleString()
}

const normalizeText = (value) => {
	if (value === undefined || value === null) return ''
	return String(value).trim()
}

const splitHistoryNotes = (value) => {
	const raw = normalizeText(value)
	if (!raw) return []
	return raw
		.split(/\n\s*\n/g)
		.map((entry) => entry.trim())
		.filter(Boolean)
}

const splitLines = (value) => {
	const raw = normalizeText(value)
	if (!raw) return []
	return raw
		.split(/\n+/g)
		.map((entry) => entry.trim())
		.filter(Boolean)
}

const interpolateTemplate = (template, variables) =>
	normalizeText(template).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey) => {
		const key = normalizeText(rawKey)
		const value = variables?.[key]
		return normalizeText(value) || 'N/A'
	})

const getCompanyProfile = () => ({
	name: normalizeText(process.env.COMPANY_NAME) || 'CMP Garage',
	addressLines: splitLines(process.env.COMPANY_ADDRESS),
	phone: normalizeText(process.env.COMPANY_PHONE),
	email: normalizeText(process.env.COMPANY_EMAIL),
})

const decodeDataUrlImage = (dataUrl) => {
	const raw = normalizeText(dataUrl)
	const match = raw.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/)
	if (!match) return null

	try {
		return Buffer.from(match[1], 'base64')
	} catch {
		return null
	}
}

const toPhotoList = (value) =>
	Array.isArray(value)
		? value
				.map((entry) => ({
					caption: normalizeText(entry?.name) || 'Ticket photo',
					uploadedAt: entry?.uploadedAt,
					buffer: decodeDataUrlImage(entry?.dataUrl),
				}))
				.filter((entry) => entry.buffer)
		: []

const pageBottom = (doc) => doc.page.height - doc.page.margins.bottom

const ensureSpaceFor = (doc, minHeight) => {
	if (doc.y + minHeight > pageBottom(doc)) {
		doc.addPage()
	}
}

const addH1 = (doc, text) => {
	ensureSpaceFor(doc, 56)
	doc.fillColor('#0b3a5b').fontSize(24).text(text)
	doc.moveDown(0.2)
	doc.strokeColor('#cbd5e1')
		.lineWidth(1)
		.moveTo(doc.page.margins.left, doc.y)
		.lineTo(doc.page.width - doc.page.margins.right, doc.y)
		.stroke()
	doc.moveDown(0.55)
}

const addH2 = (doc, text) => {
	ensureSpaceFor(doc, 46)
	doc.fillColor('#12324a').fontSize(16).text(text)
	doc.moveDown(0.08)
	doc.strokeColor('#dbeafe')
		.lineWidth(0.8)
		.moveTo(doc.page.margins.left, doc.y)
		.lineTo(doc.page.width - doc.page.margins.right, doc.y)
		.stroke()
	doc.moveDown(0.5)
}

const addH3 = (doc, text) => {
	ensureSpaceFor(doc, 28)
	doc.fillColor('#334155').fontSize(12).text(text)
	doc.moveDown(0.28)
}

const addSectionBreak = (doc, size = 0.45) => {
	ensureSpaceFor(doc, 18)
	doc.moveDown(size)
}

const addBullets = (doc, items) => {
	ensureSpaceFor(doc, 24)
	doc.fillColor('#0f172a').fontSize(11)
	if (!Array.isArray(items) || !items.length) {
		doc.text('• None', { indent: 12 })
		doc.moveDown(0.35)
		return
	}

	items.forEach((item) => {
		ensureSpaceFor(doc, 18)
		doc.text(`• ${normalizeText(item) || 'N/A'}`, {
			indent: 12,
			lineGap: 1,
		})
	})
	doc.moveDown(0.45)
}

const addPhotoSectionToPdf = (doc, title, photos) => {
	addH3(doc, title)

	if (!photos.length) {
		addBullets(doc, ['No photos uploaded'])
		doc.moveDown(0.5)
		return
	}

	const maxImageWidth = 250
	const maxImageHeight = 180

	photos.forEach((photo, index) => {
		const estimatedBlockHeight = maxImageHeight + 56
		ensureSpaceFor(doc, estimatedBlockHeight)

		doc.fillColor('#0f172a')
			.fontSize(11)
			.text(`• Photo ${index + 1}`)
		doc.moveDown(0.15)
		doc.image(photo.buffer, {
			fit: [maxImageWidth, maxImageHeight],
			align: 'left',
		})
		doc.moveDown(0.2)
		addBullets(doc, [
			`Caption: ${photo.caption}`,
			`Uploaded: ${formatPdfDate(photo.uploadedAt || new Date())}`,
		])
		doc.moveDown(0.45)
	})

	doc.fillColor('#0f172a').fontSize(11)
}

const addCoverSectionToDossier = (
	doc,
	{ vesselName, vessel, customer, serviceCount },
) => {
	const dossierGeneratedAt = new Date()
	const dossierGeneratedDate = formatPdfDate(dossierGeneratedAt)
	const vesselRegistrationDate = formatPdfDate(vessel?.registrationDate)
	const reportPurpose = interpolateTemplate(
		"This document represents the service and maintenance history on record for {{vesselName}} as serviced and coordinated by Coastal Marine Pro between {{VESSEL REGISTRATION DATE}} and {{DATE OF DOSSIER GENERATION}}. It comprises all reports for service, maintenance and inspection and repairs across the vessel's systems, presented in chronological order. Records are maintained as the work is performed to support the vessel's condition, reliability, and resale value.",
		{
			vesselName,
			'VESSEL REGISTRATION DATE': vesselRegistrationDate,
			'DATE OF DOSSIER GENERATION': dossierGeneratedDate,
		},
	)

	const companyProfile = getCompanyProfile()
	const leftColumnX = doc.page.margins.left
	const rightColumnX = doc.page.width - doc.page.margins.right - 220
	const rightColumnY = doc.page.margins.top
	const letterheadLines = [
		companyProfile.name,
		...companyProfile.addressLines,
		companyProfile.phone ? `Phone: ${companyProfile.phone}` : '',
		companyProfile.email ? `Email: ${companyProfile.email}` : '',
	].filter(Boolean)

	doc.fillColor('#0b3a5b')
		.fontSize(12)
		.text(companyProfile.name, rightColumnX, rightColumnY, {
			width: 220,
			align: 'right',
		})

	if (letterheadLines.length > 1) {
		doc.fillColor('#334155').fontSize(10)
		doc.text(
			letterheadLines.slice(1).join('\n'),
			rightColumnX,
			rightColumnY + 16,
			{
				width: 220,
				align: 'right',
				lineGap: 2,
			},
		)
	}

	const letterheadHeight = 20 + Math.max(0, letterheadLines.length - 1) * 14
	doc.y = Math.max(doc.y, doc.page.margins.top + letterheadHeight + 12)
	doc.x = leftColumnX

	addH1(doc, vesselName)
	addH2(doc, 'Vessel Service Dossier')
	addBullets(doc, [
		`Generated: ${dossierGeneratedDate}`,
		`Prepared For: ${normalizeText(customer?.name) || normalizeText(vessel?.customerName) || 'N/A'}`,
		`Primary Contact: ${normalizeText(vessel?.customerPhone) || normalizeText(customer?.phone) || 'N/A'}`,
		`Vessel: ${normalizeText(vessel?.vesselName) || 'N/A'}`,
		`Hull ID: ${normalizeText(vessel?.hullIdNumber) || 'N/A'}`,
		`Service Records Included: ${serviceCount}`,
	])

	addH3(doc, 'Report Purpose')
	doc.fillColor('#0f172a').fontSize(11).text(reportPurpose, {
		lineGap: 2,
	})
	doc.moveDown(0.45)
}

const formatDiagnosticFinding = (field, value) => {
	const friendlyName = String(field || '')
		.replace(/_/g, ' ')
		.replace(/\b\w/g, (character) => character.toUpperCase())

	return `${friendlyName}: ${normalizeText(value) || 'N/A'}`
}

const createEmailTransporter = () => {
	const MAIL_HOST = normalizeText(process.env.MAIL_HOST)
	const MAIL_PORT = normalizeText(process.env.MAIL_PORT)
	const MAIL_SECURE = normalizeText(process.env.MAIL_SECURE)
	const MAIL_USER = normalizeText(process.env.MAIL_USER)
	const MAIL_PASS = normalizeText(process.env.MAIL_PASS)
	const MAIL_FROM = normalizeText(process.env.MAIL_FROM)
	const MAIL_SERVICE = normalizeText(process.env.MAIL_SERVICE)

	if (!MAIL_FROM) {
		throw new Error('MAIL_FROM is not configured on the server')
	}

	if (MAIL_SERVICE) {
		if (!MAIL_USER || !MAIL_PASS) {
			throw new Error(
				'MAIL_USER and MAIL_PASS are required when MAIL_SERVICE is configured',
			)
		}

		return {
			transporter: nodemailer.createTransport({
				service: MAIL_SERVICE,
				auth: { user: MAIL_USER, pass: MAIL_PASS },
			}),
			fromAddress: MAIL_FROM,
		}
	}

	if (!MAIL_HOST || !MAIL_PORT || !MAIL_USER || !MAIL_PASS) {
		throw new Error(
			'MAIL_HOST, MAIL_PORT, MAIL_USER, and MAIL_PASS are required for SMTP email delivery',
		)
	}

	const parsedPort = Number(MAIL_PORT)
	if (!Number.isFinite(parsedPort)) {
		throw new Error('MAIL_PORT must be a valid number')
	}

	const secure = String(MAIL_SECURE || '').toLowerCase() === 'true'

	return {
		transporter: nodemailer.createTransport({
			host: MAIL_HOST,
			port: parsedPort,
			secure,
			auth: { user: MAIL_USER, pass: MAIL_PASS },
		}),
		fromAddress: MAIL_FROM,
	}
}

const createTicketPdfBuffer = ({ ticket, customer, vessel }) =>
	new Promise((resolve, reject) => {
		const doc = new PDFDocument({ margin: 40 })
		const chunks = []

		doc.on('data', (chunk) => chunks.push(chunk))
		doc.on('end', () => resolve(Buffer.concat(chunks)))
		doc.on('error', reject)

		doc.fontSize(20).text('CMP Garage Ticket Progress Update')
		doc.moveDown(0.5)
		doc.fontSize(11)
			.fillColor('#334155')
			.text(`Generated: ${formatPdfDate(new Date())}`)
		doc.fillColor('black')
		doc.moveDown()

		doc.fontSize(14).text('Ticket Overview')
		doc.fontSize(11)
		doc.text(
			`Ticket ID: ${normalizeText(ticket.id || ticket._id) || 'N/A'}`,
		)
		doc.text(
			`Service Title: ${normalizeText(ticket.service_title) || 'N/A'}`,
		)
		doc.text(`Category: ${normalizeText(ticket.service_category) || 'N/A'}`)
		doc.text(`Status: ${normalizeText(ticket.status) || 'N/A'}`)
		doc.text(`Priority: ${normalizeText(ticket.priority) || 'N/A'}`)
		doc.text(`Created: ${formatPdfDate(ticket.createdAt)}`)
		doc.text(`Scheduled: ${formatPdfDate(ticket.scheduledDate)}`)
		doc.moveDown()

		doc.fontSize(14).text('Customer and Vessel')
		doc.fontSize(11)
		doc.text(`Customer: ${normalizeText(customer?.name) || 'N/A'}`)
		doc.text(`Customer Email: ${normalizeText(customer?.email) || 'N/A'}`)
		doc.text(`Vessel: ${normalizeText(vessel?.vesselName) || 'N/A'}`)
		doc.moveDown()

		doc.fontSize(14).text('Initial Assessment')
		doc.fontSize(11).text(
			normalizeText(ticket.initialAssessment) ||
				'No initial assessment provided.',
		)
		doc.moveDown()

		doc.fontSize(14).text('Recommended Service')
		doc.fontSize(11).text(
			normalizeText(ticket.recommendedService) ||
				'No recommended service provided.',
		)
		doc.moveDown()

		doc.fontSize(14).text('Plan of Action')
		doc.fontSize(11)
		const planItems = Array.isArray(ticket.planOfAction)
			? ticket.planOfAction
			: []
		if (!planItems.length) {
			doc.text('No plan items have been added.')
		} else {
			planItems.forEach((item) => {
				const state = item?.completed ? '[x]' : '[ ]'
				doc.text(
					`${state} ${normalizeText(item?.text) || 'Untitled task'}`,
				)
			})
		}
		doc.moveDown()

		doc.fontSize(14).text('Required Parts')
		doc.fontSize(11)
		const requiredParts = Array.isArray(ticket.requiredParts)
			? ticket.requiredParts
			: []
		if (!requiredParts.length) {
			doc.text('No required parts have been added.')
		} else {
			requiredParts.forEach((part) => {
				const state = part?.completed ? '[x]' : '[ ]'
				doc.text(
					`${state} ${normalizeText(part?.text) || 'Unnamed part'}`,
				)
			})
		}
		doc.moveDown()

		doc.fontSize(14).text('Notes History')
		doc.fontSize(11)
		const noteEntries = splitHistoryNotes(ticket.notes)
		if (!noteEntries.length) {
			doc.text('No notes have been added.')
		} else {
			noteEntries.forEach((entry, index) => {
				doc.text(`${index + 1}. ${entry}`)
			})
		}
		doc.moveDown()

		doc.fontSize(14).text('Diagnostics')
		doc.fontSize(11)
		const diagnostics = ticket.diagnostics || {}
		const diagnosticEntries = Object.entries(diagnostics)
		if (!diagnosticEntries.length) {
			doc.text('No diagnostics have been recorded.')
		} else {
			diagnosticEntries.forEach(([field, value]) => {
				doc.text(`${field}: ${normalizeText(value) || 'N/A'}`)
			})
		}

		doc.end()
	})

const createVesselDossierPdfBuffer = ({ vessel, customer, tickets }) =>
	new Promise((resolve, reject) => {
		const doc = new PDFDocument({ margin: 40 })
		const chunks = []

		doc.on('data', (chunk) => chunks.push(chunk))
		doc.on('end', () => resolve(Buffer.concat(chunks)))
		doc.on('error', reject)

		const vesselName = normalizeText(vessel?.vesselName) || 'Vessel Dossier'
		const vesselYear = normalizeText(vessel?.vesselYear)
		const vesselMake = normalizeText(vessel?.vesselMake)
		const engineMake = normalizeText(vessel?.engineMake)
		const engineModel = normalizeText(vessel?.engineModel)
		const engineHours = normalizeText(vessel?.engineHours)
		const vesselHistory = Array.isArray(tickets)
			? [...tickets].sort(
					(a, b) =>
						new Date(a?.scheduledDate || 0).getTime() -
						new Date(b?.scheduledDate || 0).getTime(),
				)
			: []

		addCoverSectionToDossier(doc, {
			vesselName,
			vessel,
			customer,
			serviceCount: vesselHistory.length,
		})

		doc.addPage()

		addH2(doc, 'Vessel Demographics')
		addBullets(doc, [
			`Vessel Name: ${vesselName}`,
			`Year: ${vesselYear || 'N/A'}`,
			`Make: ${vesselMake || 'N/A'}`,
			`Model: ${engineModel || 'N/A'}`,
			`Owner: ${normalizeText(customer?.name) || normalizeText(vessel?.customerName) || 'N/A'}`,
			`Registration Date: ${formatPdfDate(vessel?.registrationDate)}`,
			`Customer / Primary Contact: ${normalizeText(customer?.name) || 'N/A'}`,
			`Phone: ${normalizeText(vessel?.customerPhone) || normalizeText(customer?.phone) || 'N/A'}`,
			`Email: ${normalizeText(customer?.email) || 'N/A'}`,
			`Address: ${normalizeText(customer?.address) || 'N/A'}`,
			`Hull ID: ${normalizeText(vessel?.hullIdNumber) || 'N/A'}`,
			`Number of Engines: ${normalizeText(vessel?.numberOfEngines) || 'N/A'}`,
			`Engine Make: ${engineMake || 'N/A'}`,
			`Engine Model: ${engineModel || 'N/A'}`,
			`Engine Horsepower: ${normalizeText(vessel?.engineHorsepower) || 'N/A'}`,
			`Engine Hours: ${engineHours || 'N/A'}`,
			`Generator: ${vessel?.generator ? 'Yes' : 'No'}`,
			`Boat Location: ${normalizeText(vessel?.boatLocation) || 'N/A'}`,
		])
		const serialNumbers = Array.isArray(vessel?.engineSerialNumbers)
			? vessel.engineSerialNumbers
					.map((serialNumber) => normalizeText(serialNumber))
					.filter(Boolean)
			: []
		addBullets(doc, [
			`Engine Serial Numbers: ${serialNumbers.length ? serialNumbers.join(', ') : 'N/A'}`,
		])
		addSectionBreak(doc, 0.55)

		addH2(doc, 'Chronological Service History')
		if (!vesselHistory.length) {
			addBullets(doc, ['No service history found for this vessel.'])
		} else {
			vesselHistory.forEach((ticket, index) => {
				if (index > 0) {
					ensureSpaceFor(doc, 20)
					doc.strokeColor('#e2e8f0')
						.lineWidth(0.7)
						.moveTo(doc.page.margins.left, doc.y)
						.lineTo(doc.page.width - doc.page.margins.right, doc.y)
						.stroke()
					doc.moveDown(0.65)
				}

				ensureSpaceFor(doc, 120)
				addSectionBreak(doc, 0.25)
				addH2(
					doc,
					`${index + 1}. ${normalizeText(ticket.service_title) || 'Untitled ticket'}`,
				)
				addBullets(doc, [
					`Date: ${formatPdfDate(ticket.scheduledDate)}`,
					`Category: ${normalizeText(ticket.service_category) || 'service'}`,
					`Status: ${normalizeText(ticket.status) || 'N/A'}`,
				])
				addSectionBreak(doc, 0.7)

				const diagnosticEntries = Object.entries(
					ticket.diagnostics || {},
				).filter(
					([, value]) =>
						normalizeText(value) &&
						normalizeText(value) !== 'good' &&
						normalizeText(value) !== 'N/A',
				)
				if (diagnosticEntries.length) {
					addH3(doc, 'Abnormal Findings')
					addBullets(
						doc,
						diagnosticEntries.map(([field, value]) =>
							formatDiagnosticFinding(field, value),
						),
					)
				} else {
					addH3(doc, 'Abnormal Findings')
					addBullets(doc, ['None recorded'])
				}
				addSectionBreak(doc)

				const noteEntries = splitHistoryNotes(ticket.notes)
				if (noteEntries.length) {
					addH3(doc, 'Notes')
					addBullets(doc, noteEntries)
				} else {
					addH3(doc, 'Notes')
					addBullets(doc, ['None recorded'])
				}
				addSectionBreak(doc)

				addH3(doc, 'Initial Assessment')
				addBullets(doc, [
					normalizeText(ticket.initialAssessment) ||
						'No initial assessment provided.',
				])
				addPhotoSectionToPdf(
					doc,
					'Initial Assessment Photos',
					toPhotoList(ticket.initialAssessmentPhotos),
				)
				addSectionBreak(doc)

				addH3(doc, 'Work Done')
				addBullets(doc, [
					normalizeText(ticket.summaryOfWorkPerformed) ||
						'No work performed summary provided.',
				])
				addPhotoSectionToPdf(
					doc,
					'Work Done Photos',
					toPhotoList(ticket.summaryOfWorkPerformedPhotos),
				)
				addSectionBreak(doc)

				addH3(doc, 'Work Recommended')
				addBullets(doc, [
					normalizeText(ticket.summaryOfFurtherRecommendations) ||
						normalizeText(ticket.recommendedService) ||
						'No work recommendation provided.',
				])

				addH3(doc, 'Final Assessment')
				addBullets(doc, [
					normalizeText(ticket.summaryOfWorkPerformed) ||
						'No final assessment provided.',
				])
				addSectionBreak(doc, 0.6)
			})
		}

		doc.end()
	})

export const searchCustomersByName = async (req, res) => {
	try {
		const name = req.query.name
		if (!name) {
			return sendError(res, 400, 'Name query parameter is required')
		}

		// Case-insensitive partial match
		const customers = await Customer.find({
			name: { $regex: name, $options: 'i' },
		}).select('name phone email _id')

		res.status(200).json(customers)
	} catch (error) {
		console.error('Failed to search customers:', error)
		sendError(res, 500, 'Failed to search customers')
	}
}

export const searchVesselByName = async (req, res) => {
	try {
		const name = req.query.name
		if (!name) {
			return sendError(
				res,
				400,
				'Vessel name query parameter is required',
			)
		}

		// Case-insensitive partial match on vesselName
		const vessels = await Vessel.find({
			vesselName: { $regex: name, $options: 'i' },
		}).select('vesselName vesselMake vesselYear customerId _id')

		res.status(200).json(vessels)
	} catch (error) {
		console.error('Failed to search vessels:', error)
		sendError(res, 500, 'Failed to search vessels')
	}
}

export const getCustomerProfile = async (req, res) => {
	try {
		const customerId = req.params.id || req.query.id

		if (!customerId) {
			return sendError(res, 400, 'Customer ID is required')
		}

		const customer = await Customer.findById(customerId)

		if (!customer) {
			return sendError(res, 404, 'Customer not found')
		}

		res.status(200).json(customer)
	} catch (error) {
		console.error('Failed to fetch customer profile:', error)
		sendError(res, 500, 'Failed to fetch customer profile')
	}
}

export const getBoatProfile = async (req, res) => {
	try {
		const vesselId = req.params.id || req.query.id

		if (!vesselId) {
			return sendError(res, 400, 'Vessel ID is required')
		}

		const vessel = await Vessel.findOne(toEntityQuery(vesselId))

		if (!vessel) {
			return sendError(res, 404, 'Vessel not found')
		}

		res.status(200).json(vessel)
	} catch (error) {
		console.error('Failed to fetch vessel profile:', error)
		sendError(res, 500, 'Failed to fetch vessel profile')
	}
}

/**
 * @route GET /tickets/search
 *
 * @description
 * A universal, multi‑criteria search endpoint for Tickets. This controller allows
 * searching across Ticket fields, Customer fields, and Vessel fields using both
 * exact matching and fuzzy (partial, case‑insensitive) matching. It supports
 * text search, enum filtering, date ranges, and vessel‑specific identifiers.
 *
 * ---------------------------------------------------------------------------
 * QUERY PARAMETERS
 * ---------------------------------------------------------------------------
 *
 * 1. Customer‑related filters (via populated customerId)
 *    - customerName        (string, fuzzy match)
 *         Searches tickets where the customer's name contains the provided text.
 *         Example: ?customerName=john
 *
 * 2. Vessel‑related filters (via populated vesselId)
 *    - vesselName          (string, fuzzy match)
 *         Searches tickets where the vessel name contains the provided text.
 *         Example: ?vesselName=sea
 *
 *    - hullIdNumber        (string, exact match)
 *         Searches tickets by the vessel's hull identification number.
 *         Example: ?hullIdNumber=SER280SDN2018XYZ
 *
 *    - engineSerialNumber  (string, exact match)
 *         Searches tickets where any engine serial number matches the provided value.
 *         Example: ?engineSerialNumber=ENG-SN-55667788
 *
 * 3. Ticket job‑related filters
 *    - service_title       (string, fuzzy match)
 *         Partial text search on the job title.
 *         Example: ?service_title=engine
 *
 *    - service_category    (enum: inspection | repair | maintenance | upgrade)
 *         Exact match on the job category.
 *         Example: ?service_category=repair
 *
 *    - status              (enum: open | in progress | completed | closed | cancelled | on hold)
 *         Exact match on ticket status.
 *         Example: ?status=open
 *
 *    - priority            (enum: low | medium | high)
 *         Exact match on ticket priority.
 *         Example: ?priority=high
 *
 * 4. Date range filters
 *    - createdFrom         (ISO date)
 *    - createdTo           (ISO date)
 *         Filters tickets by creation date range.
 *         Example: ?createdFrom=2026-07-01&createdTo=2026-07-15
 *
 *    - scheduledFrom       (ISO date)
 *    - scheduledTo         (ISO date)
 *         Filters tickets by scheduled job date range.
 *         Example: ?scheduledFrom=2026-07-20&scheduledTo=2026-07-30
 *
 * ---------------------------------------------------------------------------
 * HOW THE CONTROLLER WORKS
 * ---------------------------------------------------------------------------
 *
 * 1. Builds a dynamic MongoDB query object for Ticket fields:
 *      - service_title (regex fuzzy)
 *      - service_category (exact)
 *      - status (exact)
 *      - priority (exact)
 *      - createdAt date range
 *      - scheduledDate date range
 *
 * 2. Executes the query and populates:
 *      - customerId (to access customer name)
 *      - vesselId   (to access vessel name, hull ID, engine serial numbers)
 *
 * 3. Applies fuzzy search filters in JavaScript for:
 *      - customerName
 *      - vesselName
 *      - service_title (already regex)
 *
 * 4. Applies exact match filters for:
 *      - hullIdNumber
 *      - engineSerialNumber
 *
 * 5. Returns a sorted list of matching tickets (newest first).
 *
 * ---------------------------------------------------------------------------
 * EXAMPLES
 * ---------------------------------------------------------------------------
 *
 * Search by customer name:
 *      /tickets/search?customerName=john
 *
 * Search by vessel name + job type:
 *      /tickets/search?vesselName=ray&service_title=engine
 *
 * Search by hull ID:
 *      /tickets/search?hullIdNumber=SER280SDN2018XYZ
 *
 * Search by engine serial number:
 *      /tickets/search?engineSerialNumber=ENG-SN-55667788
 *
 * Search by category + status + priority:
 *      /tickets/search?service_category=repair&status=open&priority=high
 *
 * Search by scheduled date range:
 *      /tickets/search?scheduledFrom=2026-07-20&scheduledTo=2026-07-30
 *
 * Combine everything:
 *      /tickets/search?customerName=john&vesselName=sea&service_title=engine&status=open
 *
 */

export const getTicket = async (req, res) => {
	try {
		const {
			customerName,
			vesselName,
			service_title,
			service_category,
			status,
			priority,
			hullIdNumber,
			engineSerialNumber,
			createdFrom,
			createdTo,
			scheduledFrom,
			scheduledTo,
		} = req.query

		// Build base query for Ticket fields
		const query = {}

		// Regex text search for service title
		if (service_title) {
			query.service_title = { $regex: service_title, $options: 'i' }
		}

		if (service_category) query.service_category = service_category
		if (status) query.status = status
		if (priority) query.priority = priority

		// Date range: createdAt
		if (createdFrom || createdTo) {
			query.createdAt = {}
			if (createdFrom) query.createdAt.$gte = new Date(createdFrom)
			if (createdTo) query.createdAt.$lte = new Date(createdTo)
		}

		// Date range: scheduledDate
		if (scheduledFrom || scheduledTo) {
			query.scheduledDate = {}
			if (scheduledFrom)
				query.scheduledDate.$gte = new Date(scheduledFrom)
			if (scheduledTo) query.scheduledDate.$lte = new Date(scheduledTo)
		}

		// Step 1: Query tickets + populate joins
		let tickets = await Ticket.find(query)
			.populate('customerId')
			.populate('vesselId')
			.sort({ createdAt: -1 })

		// Step 2: Fuzzy search helper
		const fuzzy = (text, search) => {
			if (!text) return false
			return text.toLowerCase().includes(search.toLowerCase())
		}

		// Step 3: Filter by customer name (fuzzy)
		if (customerName) {
			tickets = tickets.filter((t) =>
				fuzzy(t.customerId?.name, customerName),
			)
		}

		// Step 4: Filter by vessel name (fuzzy)
		if (vesselName) {
			tickets = tickets.filter((t) =>
				fuzzy(t.vesselId?.vesselName, vesselName),
			)
		}

		// Step 5: Filter by hull ID
		if (hullIdNumber) {
			tickets = tickets.filter(
				(t) =>
					t.vesselId?.hullIdNumber?.toLowerCase() ===
					hullIdNumber.toLowerCase(),
			)
		}

		// Step 6: Filter by engine serial number
		if (engineSerialNumber) {
			tickets = tickets.filter((t) =>
				t.vesselId?.engineSerialNumbers?.some(
					(sn) =>
						sn.toLowerCase() === engineSerialNumber.toLowerCase(),
				),
			)
		}

		res.status(200).json(tickets)
	} catch (error) {
		console.error('Ticket search failed:', error)
		sendError(res, 500, 'Failed to search tickets')
	}
}

export const getReminder = async (req, res) => {
	try {
		const reminder = await Reminder.find().sort({ dueDate: 1 })
		res.status(200).json(reminder)
	} catch (error) {
		sendError(res, 500, 'Failed to fetch reminder')
	}
}

export const getAllCustomers = async (req, res) => {
	try {
		const customers = await Customer.find().sort({ createdAt: -1 })
		res.status(200).json(customers)
	} catch (error) {
		sendError(res, 500, 'Failed to fetch customers')
	}
}

export const getAllBoats = async (req, res) => {
	try {
		const vessels = await Vessel.find().sort({ createdAt: -1 })
		res.status(200).json(vessels)
	} catch (error) {
		sendError(res, 500, 'Failed to fetch vessels')
	}
}

export const getAllTickets = async (req, res) => {
	try {
		const tickets = await Ticket.find().sort({ createdAt: -1 })
		res.status(200).json(tickets)
	} catch (error) {
		sendError(res, 500, 'Failed to fetch tickets')
	}
}

export const getAllReminders = async (req, res) => {
	try {
		const reminders = await Reminder.find().sort({ dueDate: 1 })
		res.status(200).json(reminders)
	} catch (error) {
		sendError(res, 500, 'Failed to fetch reminders')
	}
}

export const newCustomer = async (req, res) => {
	try {
		const customer = await Customer.create(buildRecord(req.body))
		res.status(201).json(customer)
	} catch (error) {
		console.error(error)
		sendError(res, 500, 'Failed to create customer')
	}
}

export const newBoat = async (req, res) => {
	try {
		const vessel = await Vessel.create(buildRecord(req.body))
		res.status(201).json(vessel)
	} catch (error) {
		console.error(error)
		sendError(res, 500, 'Failed to create vessel')
	}
}

export const newTicket = async (req, res) => {
	try {
		const ticket = await Ticket.create(buildRecord(req.body))
		res.status(201).json(ticket)
	} catch (error) {
		sendError(res, 500, 'Failed to create ticket')
	}
}

export const newReminder = async (req, res) => {
	try {
		const reminder = await Reminder.create(
			buildRecord(req.body, { notes: '' }),
		)
		res.status(201).json(reminder)
	} catch (error) {
		sendError(res, 500, 'Failed to create reminder')
	}
}

export const updateCustomer = async (req, res) => {
	try {
		const customerId = String(req.params.id || '').trim()
		const query = toEntityQuery(customerId)

		const updated = await Customer.findOneAndUpdate(query, req.body, {
			new: true,
			runValidators: true,
		})

		if (!updated) {
			return sendError(res, 404, 'Customer not found')
		}

		res.status(200).json(updated)
	} catch (error) {
		sendError(res, 500, 'Failed to update customer')
	}
}

export const updateBoat = async (req, res) => {
	try {
		const vesselId = String(req.params.id || '').trim()
		const query = toEntityQuery(vesselId)

		const updated = await Vessel.findOneAndUpdate(query, req.body, {
			new: true,
			runValidators: true,
		})

		if (!updated) {
			return sendError(res, 404, 'Vessel not found')
		}

		res.status(200).json(updated)
	} catch (error) {
		sendError(res, 500, 'Failed to update vessel')
	}
}

export const updateTicket = async (req, res) => {
	try {
		const ticketId = String(req.params.id || '')
		const query = toTicketQuery(ticketId)

		const updated = await Ticket.findOneAndUpdate(query, req.body, {
			new: true,
			runValidators: true,
		})

		if (!updated) {
			return sendError(res, 404, 'Ticket not found')
		}

		res.status(200).json(updated)
	} catch (error) {
		sendError(res, 500, 'Failed to update ticket')
	}
}

export const emailTicketProgress = async (req, res) => {
	try {
		const ticketId = String(req.params.id || '').trim()
		if (!ticketId) {
			return sendError(res, 400, 'Ticket id is required')
		}

		const ticket = await Ticket.findOne(toTicketQuery(ticketId)).lean()
		if (!ticket) {
			return sendError(res, 404, 'Ticket not found')
		}

		const customerId = String(ticket.customerId || '').trim()
		if (!customerId) {
			return sendError(res, 400, 'Ticket has no customer associated')
		}

		const customer = await Customer.findOne(
			toEntityQuery(customerId),
		).lean()
		if (!customer) {
			return sendError(res, 404, 'Customer for this ticket was not found')
		}

		const customerEmail = normalizeText(customer.email)
		if (!customerEmail) {
			return sendError(
				res,
				400,
				'Customer profile does not have an email address configured',
			)
		}

		const vesselId = String(ticket.vesselId || '').trim()
		const vessel = vesselId
			? await Vessel.findOne(toEntityQuery(vesselId)).lean()
			: null

		const { transporter, fromAddress } = createEmailTransporter()
		const pdfBuffer = await createTicketPdfBuffer({
			ticket,
			customer,
			vessel,
		})
		const ticketRef = normalizeText(ticket.id || ticket._id) || 'ticket'

		await transporter.sendMail({
			from: fromAddress,
			to: customerEmail,
			subject: `CMP Garage progress update: ${normalizeText(ticket.service_title) || ticketRef}`,
			text:
				`Hello ${normalizeText(customer.name) || 'Customer'},\n\n` +
				`Attached is the latest progress update for your service ticket.\n\n` +
				`Ticket: ${normalizeText(ticket.service_title) || ticketRef}\n` +
				`Status: ${normalizeText(ticket.status) || 'N/A'}\n\n` +
				`Thank you,\nCMP Garage`,
			attachments: [
				{
					filename: `ticket-progress-${ticketRef}.pdf`,
					content: pdfBuffer,
					contentType: 'application/pdf',
				},
			],
		})

		res.status(200).json({
			message: `Progress update emailed to ${customerEmail}`,
			recipient: customerEmail,
		})
	} catch (error) {
		console.error('Failed to email ticket progress update:', error)
		const message = error instanceof Error ? error.message : String(error)
		const isMailConfigError =
			message.includes('MAIL_FROM') ||
			message.includes('MAIL_HOST') ||
			message.includes('MAIL_PORT') ||
			message.includes('MAIL_USER') ||
			message.includes('MAIL_PASS') ||
			message.includes('MAIL_SERVICE')

		if (isMailConfigError) {
			return sendError(res, 400, message)
		}

		const isMailDeliveryError =
			message.includes('ECONNECTION') ||
			message.includes('EAUTH') ||
			message.includes('Invalid login') ||
			message.includes('ENOTFOUND') ||
			message.includes('ETIMEDOUT')

		if (isMailDeliveryError) {
			return sendError(res, 502, `Email delivery failed: ${message}`)
		}

		sendError(res, 500, message || 'Failed to email ticket progress update')
	}
}

export const emailVesselDossier = async (req, res) => {
	try {
		const vesselId = String(req.params.id || '').trim()
		if (!vesselId) {
			return sendError(res, 400, 'Vessel id is required')
		}

		const vessel = await Vessel.findOne(toEntityQuery(vesselId)).lean()
		if (!vessel) {
			return sendError(res, 404, 'Vessel not found')
		}

		const customerId = String(vessel.customerId || '').trim()
		if (!customerId) {
			return sendError(res, 400, 'Vessel has no customer associated')
		}

		const customer = await Customer.findOne(
			toEntityQuery(customerId),
		).lean()
		if (!customer) {
			return sendError(res, 404, 'Customer for this vessel was not found')
		}

		const customerEmail = normalizeText(customer.email)
		if (!customerEmail) {
			return sendError(
				res,
				400,
				'Customer profile does not have an email address configured',
			)
		}

		const adminCopyRecipient = normalizeText(
			process.env.MAIL_COPY_TO ||
				process.env.MAIL_TO ||
				process.env.MAIL_FROM,
		)
		if (!adminCopyRecipient) {
			return sendError(
				res,
				400,
				'No copy recipient configured. Set MAIL_COPY_TO, MAIL_TO, or MAIL_FROM.',
			)
		}

		const historyTickets = await Ticket.find({ vesselId })
			.sort({ scheduledDate: -1 })
			.lean()
		const { transporter, fromAddress } = createEmailTransporter()
		const pdfBuffer = await createVesselDossierPdfBuffer({
			vessel,
			customer,
			tickets: historyTickets,
		})
		const vesselRef = normalizeText(vessel.vesselName) || vesselId

		await transporter.sendMail({
			from: fromAddress,
			to: [customerEmail, adminCopyRecipient],
			subject: `CMP Garage vessel dossier: ${vesselRef}`,
			text:
				`Hello ${normalizeText(customer.name) || 'Customer'},\n\n` +
				`Attached is the vessel dossier for ${vesselRef}.\n\n` +
				`Thank you,\nCMP Garage`,
			attachments: [
				{
					filename: `vessel-dossier-${vesselRef}.pdf`,
					content: pdfBuffer,
					contentType: 'application/pdf',
				},
			],
		})

		res.status(200).json({
			message: `Vessel dossier emailed to ${customerEmail} and ${adminCopyRecipient}`,
			recipients: [customerEmail, adminCopyRecipient],
		})
	} catch (error) {
		console.error('Failed to email vessel dossier:', error)
		const message = error instanceof Error ? error.message : String(error)
		const isMailConfigError =
			message.includes('MAIL_FROM') ||
			message.includes('MAIL_HOST') ||
			message.includes('MAIL_PORT') ||
			message.includes('MAIL_USER') ||
			message.includes('MAIL_PASS') ||
			message.includes('MAIL_SERVICE')

		if (isMailConfigError) {
			return sendError(res, 400, message)
		}

		const isMailDeliveryError =
			message.includes('ECONNECTION') ||
			message.includes('EAUTH') ||
			message.includes('Invalid login') ||
			message.includes('ENOTFOUND') ||
			message.includes('ETIMEDOUT')

		if (isMailDeliveryError) {
			return sendError(res, 502, `Email delivery failed: ${message}`)
		}

		sendError(res, 500, message || 'Failed to email vessel dossier')
	}
}

export const previewVesselDossier = async (req, res) => {
	try {
		const vesselId = String(req.params.id || '').trim()
		if (!vesselId) {
			return sendError(res, 400, 'Vessel id is required')
		}

		const vessel = await Vessel.findOne(toEntityQuery(vesselId)).lean()
		if (!vessel) {
			return sendError(res, 404, 'Vessel not found')
		}

		const customerId = String(vessel.customerId || '').trim()
		if (!customerId) {
			return sendError(res, 400, 'Vessel has no customer associated')
		}

		const customer = await Customer.findOne(
			toEntityQuery(customerId),
		).lean()
		if (!customer) {
			return sendError(res, 404, 'Customer for this vessel was not found')
		}

		const historyTickets = await Ticket.find({ vesselId })
			.sort({ scheduledDate: -1 })
			.lean()
		const pdfBuffer = await createVesselDossierPdfBuffer({
			vessel,
			customer,
			tickets: historyTickets,
		})
		const vesselRef = normalizeText(vessel.vesselName) || vesselId

		res.status(200)
			.setHeader('Content-Type', 'application/pdf')
			.setHeader(
				'Content-Disposition',
				`inline; filename="vessel-dossier-${vesselRef}.pdf"`,
			)
			.send(pdfBuffer)
	} catch (error) {
		console.error('Failed to generate vessel dossier preview:', error)
		const message = error instanceof Error ? error.message : String(error)
		sendError(
			res,
			500,
			message || 'Failed to generate vessel dossier preview',
		)
	}
}

export const updateReminder = async (req, res) => {
	try {
		const reminderId = String(req.params.id || '').trim()
		const query = toEntityQuery(reminderId)

		const updated = await Reminder.findOneAndUpdate(query, req.body, {
			new: true,
			runValidators: true,
		})

		if (!updated) {
			return sendError(res, 404, 'Reminder not found')
		}

		res.status(200).json(updated)
	} catch (error) {
		sendError(res, 500, 'Failed to update reminder')
	}
}

export const deleteCustomer = async (req, res) => {
	try {
		const deleted = await Customer.findOneAndDelete({ id: req.params.id })

		if (!deleted) {
			return sendError(res, 404, 'Customer not found')
		}

		res.status(200).json({ message: 'Customer deleted' })
	} catch (error) {
		sendError(res, 500, 'Failed to delete customer')
	}
}

export const deleteBoat = async (req, res) => {
	try {
		const deleted = await Vessel.findOneAndDelete({ id: req.params.id })

		if (!deleted) {
			return sendError(res, 404, 'Vessel not found')
		}

		res.status(200).json({ message: 'Vessel deleted' })
	} catch (error) {
		sendError(res, 500, 'Failed to delete vessel')
	}
}

export const deleteTicket = async (req, res) => {
	try {
		const deleted = await Ticket.findOneAndDelete({ id: req.params.id })

		if (!deleted) {
			return sendError(res, 404, 'Ticket not found')
		}

		res.status(200).json({ message: 'Ticket deleted' })
	} catch (error) {
		sendError(res, 500, 'Failed to delete ticket')
	}
}

export const deleteReminder = async (req, res) => {
	try {
		const deleted = await Reminder.findOneAndDelete({ id: req.params.id })

		if (!deleted) {
			return sendError(res, 404, 'reminder not found')
		}

		res.status(200).json({ message: 'reminder deleted' })
	} catch (error) {
		sendError(res, 500, 'Failed to delete reminder')
	}
}
