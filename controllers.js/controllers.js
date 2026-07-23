import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import nodemailer from 'nodemailer'
import PDFDocument from 'pdfkit'
import { Customer, Vessel, Ticket, Reminder, User } from '../models/models.js'
import { createAuthToken } from '../middleware/auth.js'
import {
	emitConversationUpdated,
	emitConversationUpdatedToAll,
} from '../realtime.js'

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

const normalizeEmail = (value) => normalizeText(value).toLowerCase()

const normalizePhoneDigits = (value) => normalizeText(value).replace(/\D/g, '')

const escapeRegex = (value) =>
	normalizeText(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const findCustomerForVessel = async (vessel) => {
	if (!vessel) return null

	const candidateIds = [
		normalizeText(vessel.customerId),
		normalizeText(vessel.owner),
	].filter(Boolean)

	for (const candidateId of candidateIds) {
		const byId = await Customer.findOne(toEntityQuery(candidateId)).lean()
		if (byId) return byId
	}

	const vesselName = normalizeText(vessel.customerName)
	const vesselPhoneDigits = normalizePhoneDigits(vessel.customerPhone)

	if (vesselName) {
		const byName = await Customer.find({
			name: { $regex: new RegExp(`^${escapeRegex(vesselName)}$`, 'i') },
		})
			.limit(10)
			.lean()

		if (vesselPhoneDigits) {
			const exactByNameAndPhone = byName.find(
				(entry) =>
					normalizePhoneDigits(entry.phone) === vesselPhoneDigits,
			)
			if (exactByNameAndPhone) return exactByNameAndPhone
		}

		if (byName.length === 1) {
			return byName[0]
		}
	}

	if (vesselPhoneDigits) {
		const byPhone = await Customer.find()
			.select('name phone email address createdAt')
			.lean()
		const exactByPhone = byPhone.find(
			(entry) => normalizePhoneDigits(entry.phone) === vesselPhoneDigits,
		)
		if (exactByPhone) return exactByPhone
	}

	return null
}

const toPublicUser = (user) => ({
	id: normalizeText(user?.id || user?._id),
	name: normalizeText(user?.name),
	email: normalizeEmail(user?.email),
	role: normalizeText(user?.role) || 'user',
	createdAt: user?.createdAt,
})

const normalizeConversationMessage = (entry) => {
	const senderName = normalizeText(entry?.senderName || entry?.sender)
	const readByUserIds = Array.isArray(entry?.readByUserIds)
		? entry.readByUserIds
				.map((value) => normalizeText(value))
				.filter(Boolean)
		: []
	return {
		id: normalizeText(entry?.id) || randomUUID(),
		senderId: normalizeText(entry?.senderId),
		senderName: senderName || 'Unknown user',
		recipientId: normalizeText(entry?.recipientId),
		recipientName: normalizeText(entry?.recipientName),
		text: normalizeText(entry?.text),
		timestamp: entry?.timestamp || new Date().toISOString(),
		readByUserIds,
	}
}

const normalizeConversationMessages = (value) =>
	Array.isArray(value)
		? value
				.map(normalizeConversationMessage)
				.filter((entry) => normalizeText(entry.text))
				.sort(
					(a, b) =>
						new Date(a.timestamp || 0).getTime() -
						new Date(b.timestamp || 0).getTime(),
				)
		: []

const getConversationModel = (type) => {
	if (type === 'ticket') return Ticket
	if (type === 'reminder') return Reminder
	return null
}

const getConversationQuery = (type, entityId) =>
	type === 'ticket' ? toTicketQuery(entityId) : toEntityQuery(entityId)

const getConversationTitle = (type, record) =>
	type === 'ticket'
		? normalizeText(record?.service_title) || 'Untitled ticket'
		: normalizeText(record?.title) || 'Untitled reminder'

const getConversationSubtitle = (type, record) => {
	if (type === 'ticket') {
		const category = normalizeText(record?.service_category) || 'service'
		const status = normalizeText(record?.status) || 'N/A'
		return `${category} • ${status}`
	}

	const relatedType = normalizeText(record?.relatedTo?.type) || 'reminder'
	const completionLabel = record?.completed ? 'completed' : 'open'
	return `${relatedType} • ${completionLabel}`
}

const buildConversationRecord = (type, record) => {
	const entityId = normalizeText(record?.id || record?._id)
	return {
		conversationId: `${type}:${entityId}`,
		type,
		entityId,
		title: getConversationTitle(type, record),
		subtitle: getConversationSubtitle(type, record),
		sourceRouteName: type === 'ticket' ? 'Ticket' : 'Reminder',
		archivedByUserIds: Array.isArray(record?.archivedByUserIds)
			? record.archivedByUserIds
					.map((entry) => normalizeText(entry))
					.filter(Boolean)
			: [],
		messages: normalizeConversationMessages(record?.messages),
	}
}

const buildConversationSummary = (type, record, authUserId = '') => {
	const conversation = buildConversationRecord(type, record)
	if (
		authUserId &&
		Array.isArray(conversation.archivedByUserIds) &&
		conversation.archivedByUserIds.includes(normalizeText(authUserId))
	) {
		return null
	}
	if (!conversation.messages.length) return null

	const lastMessage = conversation.messages[conversation.messages.length - 1]
	const normalizedAuthUserId = normalizeText(authUserId)
	const partnerNames = Array.from(
		new Set(
			conversation.messages
				.filter(
					(entry) =>
						normalizeText(entry.senderId) !== normalizedAuthUserId,
				)
				.map((entry) => normalizeText(entry.senderName))
				.filter(Boolean),
		),
	)
	const unreadCount = normalizedAuthUserId
		? conversation.messages.filter(
				(entry) =>
					normalizeText(entry.senderId) !== normalizedAuthUserId &&
					!entry.readByUserIds.includes(normalizedAuthUserId),
			).length
		: 0

	return {
		conversationId: conversation.conversationId,
		type: conversation.type,
		entityId: conversation.entityId,
		title: conversation.title,
		subtitle: conversation.subtitle,
		sourceRouteName: conversation.sourceRouteName,
		partnerNames,
		lastMessageAt: lastMessage?.timestamp || '',
		lastMessagePreview: normalizeText(lastMessage?.text).slice(0, 140),
		messageCount: conversation.messages.length,
		unreadCount,
		hasUnread: unreadCount > 0,
	}
}

const collectConversationParticipantIds = (messages) =>
	Array.from(
		new Set(
			normalizeConversationMessages(messages)
				.flatMap((entry) => [entry.senderId, entry.recipientId])
				.map((entry) => normalizeText(entry))
				.filter(Boolean),
		),
	)

const markConversationMessagesRead = (record, authUserId) => {
	const normalizedAuthUserId = normalizeText(authUserId)
	if (!normalizedAuthUserId) return false

	let changed = false
	record.messages = normalizeConversationMessages(record.messages).map(
		(entry) => {
			if (
				entry.senderId === normalizedAuthUserId ||
				entry.readByUserIds.includes(normalizedAuthUserId)
			) {
				return entry
			}

			changed = true
			return {
				...entry,
				readByUserIds: [...entry.readByUserIds, normalizedAuthUserId],
			}
		},
	)

	return changed
}

const archiveConversationForUser = (record, authUserId) => {
	const normalizedAuthUserId = normalizeText(authUserId)
	if (!normalizedAuthUserId) return false

	const archivedByUserIds = Array.isArray(record.archivedByUserIds)
		? record.archivedByUserIds
				.map((entry) => normalizeText(entry))
				.filter(Boolean)
		: []

	if (archivedByUserIds.includes(normalizedAuthUserId)) {
		return false
	}

	record.archivedByUserIds = [...archivedByUserIds, normalizedAuthUserId]
	return true
}

const clearConversationArchiveForParticipants = (record, participantIds) => {
	const activeParticipantIds = new Set(
		participantIds.map((entry) => normalizeText(entry)).filter(Boolean),
	)
	const archivedByUserIds = Array.isArray(record.archivedByUserIds)
		? record.archivedByUserIds
				.map((entry) => normalizeText(entry))
				.filter(Boolean)
		: []

	record.archivedByUserIds = archivedByUserIds.filter(
		(entry) => !activeParticipantIds.has(entry),
	)
}

const validatePassword = (password) => {
	if (password.length < 8) {
		return 'Password must be at least 8 characters long'
	}
	return ''
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

	addH3(doc, 'Vessel Profile Photo')
	const vesselPhotoBuffer = decodeDataUrlImage(vessel?.boatPhotoDataUrl)
	if (vesselPhotoBuffer) {
		ensureSpaceFor(doc, 260)
		try {
			doc.image(vesselPhotoBuffer, {
				fit: [420, 240],
				align: 'left',
			})
			doc.moveDown(0.35)
		} catch {
			addBullets(doc, [
				'Vessel profile photo could not be rendered from the saved image data.',
			])
		}
	} else {
		addBullets(doc, ['No vessel profile photo on file.'])
	}

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

const formatPdfDateShort = (value) => {
	if (!value) return 'N/A'
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return 'N/A'
	return date.toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	})
}

const formatDateRangeLabel = (records) => {
	if (!Array.isArray(records) || !records.length) return 'N/A'

	const normalizedDates = records
		.map(
			(record) =>
				new Date(record?.scheduledDate || record?.createdAt || 0),
		)
		.filter((date) => !Number.isNaN(date.getTime()))
		.sort((a, b) => a.getTime() - b.getTime())

	if (!normalizedDates.length) return 'N/A'
	if (normalizedDates.length === 1) {
		return formatPdfDateShort(normalizedDates[0])
	}

	return `${formatPdfDateShort(normalizedDates[0])} - ${formatPdfDateShort(normalizedDates[normalizedDates.length - 1])}`
}

const normalizeForComparison = (value) => normalizeText(value).toLowerCase()

const getDossierEntryType = (ticket) => {
	const category = normalizeForComparison(ticket?.service_category)
	const title = normalizeForComparison(ticket?.service_title)

	if (category.includes('diagnostic') || title.includes('diagnostic')) {
		return 'DIAGNOSTIC'
	}
	if (category.includes('repair') || title.includes('repair')) {
		return 'REPAIR'
	}
	if (category.includes('maintenance') || title.includes('maintenance')) {
		return 'MAINTENANCE'
	}
	if (category.includes('upgrade') || title.includes('upgrade')) {
		return 'UPGRADE'
	}

	return 'SERVICE'
}

const getDossierEntryTheme = (entryType) => {
	if (entryType === 'DIAGNOSTIC') {
		return { accent: '#f97316', soft: '#fff7ed', text: '#9a3412' }
	}
	if (entryType === 'REPAIR') {
		return { accent: '#f59e0b', soft: '#fffbeb', text: '#92400e' }
	}
	if (entryType === 'MAINTENANCE') {
		return { accent: '#2563eb', soft: '#eff6ff', text: '#1e40af' }
	}
	if (entryType === 'UPGRADE') {
		return { accent: '#0ea5e9', soft: '#ecfeff', text: '#0c4a6e' }
	}

	return { accent: '#475569', soft: '#f8fafc', text: '#334155' }
}

const getTicketDiagnosticFindings = (ticket) =>
	Object.entries(ticket?.diagnostics || {})
		.filter(([, value]) => {
			const normalizedValue = normalizeForComparison(value)
			return (
				normalizedValue &&
				normalizedValue !== 'n/a' &&
				normalizedValue !== 'good' &&
				normalizedValue !== 'normal' &&
				normalizedValue !== 'ok'
			)
		})
		.map(([field, value]) => formatDiagnosticFinding(field, value))

const addDossierFooter = (doc, companyProfile) => {
	const originalX = doc.x
	const originalY = doc.y
	const left = doc.page.margins.left
	const right = doc.page.width - doc.page.margins.right
	const footerY = doc.page.height - doc.page.margins.bottom - 20
	const locationLine = companyProfile.addressLines.length
		? companyProfile.addressLines.join(' / ')
		: ''

	doc.save()
	doc.strokeColor('#cbd5e1')
		.lineWidth(0.7)
		.moveTo(left, footerY - 8)
		.lineTo(right, footerY - 8)
		.stroke()

	doc.font('Helvetica-Bold')
		.fontSize(8)
		.fillColor('#0f172a')
		.text(companyProfile.name, left, footerY, { lineBreak: false })

	doc.font('Helvetica')
		.fontSize(7)
		.fillColor('#475569')
		.text(locationLine || 'Vessel marine service', left, footerY + 10, {
			lineBreak: false,
		})

	doc.font('Helvetica')
		.fontSize(7)
		.fillColor('#b45309')
		.text('DOCUMENTED. MAINTAINED. READY.', left, footerY, {
			width: right - left,
			align: 'right',
			lineBreak: false,
		})
	doc.restore()
	doc.x = originalX
	doc.y = originalY
}

const drawServiceTimelineTable = (
	doc,
	history,
	fallbackEngineHours = 'N/A',
) => {
	const left = doc.page.margins.left
	const width =
		doc.page.width - doc.page.margins.left - doc.page.margins.right
	const columns = [
		{ label: 'VISIT', widthRatio: 0.43 },
		{ label: 'DATE', widthRatio: 0.18 },
		{ label: 'TYPE', widthRatio: 0.15 },
		{ label: 'HOURS', widthRatio: 0.1 },
		{ label: 'STATUS', widthRatio: 0.14 },
	]
	const columnWidths = columns.map((column) =>
		Math.floor(width * column.widthRatio),
	)
	columnWidths[columnWidths.length - 1] +=
		width - columnWidths.reduce((sum, entry) => sum + entry, 0)

	const drawHeader = () => {
		ensureSpaceFor(doc, 42)
		doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b')
		let currentX = left
		columns.forEach((column, index) => {
			doc.text(column.label, currentX + 4, doc.y, {
				width: columnWidths[index] - 8,
				lineBreak: false,
			})
			currentX += columnWidths[index]
		})
		doc.y += 12
		doc.strokeColor('#cbd5e1')
			.lineWidth(0.8)
			.moveTo(left, doc.y)
			.lineTo(left + width, doc.y)
			.stroke()
		doc.y += 8
	}

	drawHeader()

	if (!history.length) {
		doc.font('Helvetica')
			.fontSize(10)
			.fillColor('#334155')
			.text('No documented services yet.')
		doc.moveDown(0.4)
		return
	}

	history.forEach((ticket) => {
		const entryType = getDossierEntryType(ticket)
		const rowValues = [
			normalizeText(ticket?.service_title) || 'Untitled service',
			formatPdfDateShort(ticket?.scheduledDate || ticket?.createdAt),
			entryType,
			normalizeText(
				ticket?.engineHours ||
					ticket?.hoursLogged ||
					fallbackEngineHours ||
					'N/A',
			),
			normalizeText(ticket?.status || entryType),
		]

		const textHeights = rowValues.map((value, index) =>
			doc.heightOfString(value, {
				width: columnWidths[index] - 10,
				align: 'left',
			}),
		)
		const rowHeight = Math.max(
			22,
			...textHeights.map((height) => height + 6),
		)

		if (doc.y + rowHeight + 18 > pageBottom(doc)) {
			doc.addPage()
			drawHeader()
		}

		let currentX = left
		doc.font('Helvetica').fontSize(9).fillColor('#0f172a')
		rowValues.forEach((value, index) => {
			doc.text(value, currentX + 4, doc.y + 2, {
				width: columnWidths[index] - 8,
				lineGap: 1,
			})
			currentX += columnWidths[index]
		})

		doc.y += rowHeight
		doc.strokeColor('#e2e8f0')
			.lineWidth(0.6)
			.moveTo(left, doc.y)
			.lineTo(left + width, doc.y)
			.stroke()
		doc.y += 6
	})

	doc.moveDown(0.4)
}

const addDetailCardLine = (doc, label, body, width) => {
	const safeBody = normalizeText(body) || 'Not documented.'
	doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a').text(label, {
		width,
		lineGap: 1,
	})
	doc.font('Helvetica').fontSize(9).fillColor('#1e293b').text(safeBody, {
		width,
		lineGap: 2,
	})
	doc.moveDown(0.3)
}

const drawDetailedServiceCards = (doc, history) => {
	const left = doc.page.margins.left
	const width =
		doc.page.width - doc.page.margins.left - doc.page.margins.right

	if (!history.length) {
		doc.font('Helvetica')
			.fontSize(10)
			.fillColor('#334155')
			.text('No detailed service records found.')
		return
	}

	history.forEach((ticket) => {
		const entryType = getDossierEntryType(ticket)
		const theme = getDossierEntryTheme(entryType)
		const findings = getTicketDiagnosticFindings(ticket)
		const reportedConcern =
			normalizeText(ticket?.initialAssessment) ||
			normalizeText(ticket?.notes) ||
			'No concern was documented for this visit.'
		const workPerformed =
			normalizeText(ticket?.summaryOfWorkPerformed) ||
			normalizeText(ticket?.recommendedService) ||
			'No work summary was documented for this visit.'
		const recommendation =
			normalizeText(ticket?.summaryOfFurtherRecommendations) ||
			normalizeText(ticket?.recommendedService) ||
			'No additional recommendations were documented.'

		const tempMeasureDoc = new PDFDocument({ margin: 0 })
		const estimateLineHeight = (text, fontSize = 9) => {
			tempMeasureDoc.font('Helvetica').fontSize(fontSize)
			return tempMeasureDoc.heightOfString(text, {
				width: width - 34,
				lineGap: 2,
			})
		}

		const findingsText = findings.length
			? findings.join(' | ')
			: 'No abnormal findings recorded.'
		const estimatedBodyHeight =
			estimateLineHeight(reportedConcern) +
			estimateLineHeight(findingsText) +
			estimateLineHeight(workPerformed) +
			estimateLineHeight(recommendation) +
			140

		ensureSpaceFor(doc, Math.max(190, estimatedBodyHeight))

		const cardTop = doc.y
		doc.save()
		doc.roundedRect(
			left,
			cardTop,
			width,
			Math.max(190, estimatedBodyHeight),
			8,
		).fillAndStroke('#ffffff', '#dbeafe')
		doc.restore()

		doc.save()
		doc.rect(left, cardTop, width, 28).fill('#f8fafc')
		doc.restore()

		doc.font('Helvetica-Bold')
			.fontSize(11)
			.fillColor('#0f172a')
			.text(
				normalizeText(ticket?.service_title) ||
					'Untitled service record',
				left + 12,
				cardTop + 8,
				{ width: width - 130, lineBreak: false },
			)

		const badgeWidth = 88
		doc.save()
		doc.roundedRect(
			left + width - badgeWidth - 12,
			cardTop + 6,
			badgeWidth,
			16,
			3,
		).fill(theme.soft)
		doc.restore()
		doc.font('Helvetica-Bold')
			.fontSize(7)
			.fillColor(theme.text)
			.text(entryType, left + width - badgeWidth - 12, cardTop + 10, {
				width: badgeWidth,
				align: 'center',
				lineBreak: false,
			})

		doc.font('Helvetica')
			.fontSize(8)
			.fillColor('#475569')
			.text(
				`${formatPdfDateShort(ticket?.scheduledDate || ticket?.createdAt)} | ${normalizeText(ticket?.priority) || 'standard priority'}`,
				left + 12,
				cardTop + 32,
				{ width: width - 24 },
			)

		doc.y = cardTop + 48
		addDetailCardLine(doc, 'Reported concern', reportedConcern, width - 24)
		addDetailCardLine(doc, 'Findings', findingsText, width - 24)
		addDetailCardLine(doc, 'Work performed', workPerformed, width - 24)
		addDetailCardLine(doc, 'Recommendations', recommendation, width - 24)

		doc.y = cardTop + Math.max(190, estimatedBodyHeight) + 10
	})
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

const formatCurrencyUsd = (value) => {
	const numeric = Number(value)
	const safe = Number.isFinite(numeric) && numeric > 0 ? numeric : 0
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
	}).format(safe)
}

const createTicketPdfBuffer = ({ ticket, customer, vessel }) =>
	new Promise((resolve, reject) => {
		const doc = new PDFDocument({ margin: 40 })
		const chunks = []

		doc.on('data', (chunk) => chunks.push(chunk))
		doc.on('end', () => resolve(Buffer.concat(chunks)))
		doc.on('error', reject)

		const companyProfile = getCompanyProfile()
		let isRenderingFooter = false
		doc.on('pageAdded', () => {
			if (isRenderingFooter) return
			isRenderingFooter = true
			addDossierFooter(doc, companyProfile)
			isRenderingFooter = false
		})

		const left = doc.page.margins.left
		const width =
			doc.page.width - doc.page.margins.left - doc.page.margins.right
		const ticketRef = normalizeText(ticket.id || ticket._id) || 'ticket'
		const serviceTitle =
			normalizeText(ticket.service_title) || 'Untitled service'
		const customerName = normalizeText(customer?.name) || 'Customer'
		const customerEmail = normalizeText(customer?.email) || 'N/A'
		const vesselName =
			normalizeText(vessel?.vesselName) ||
			normalizeText(ticket?.vesselName) ||
			'N/A'
		const status = normalizeText(ticket?.status) || 'N/A'
		const statusNormalized = normalizeForComparison(status)
		const isFinalInvoice = statusNormalized === 'closed'
		const reportTitle = isFinalInvoice
			? 'FINAL SERVICE INVOICE'
			: 'SERVICE PROGRESS UPDATE'
		const reportContext = isFinalInvoice
			? 'This report documents the final completed work and invoice totals for your service ticket.'
			: 'This report provides the latest status and work details for your active service ticket.'

		const requiredParts = Array.isArray(ticket.requiredParts)
			? ticket.requiredParts
			: []
		const selectedParts = requiredParts.filter((part) => part?.completed)
		const selectedPartsTotal = selectedParts.reduce((total, part) => {
			const value = Number(part?.cost ?? 0)
			if (!Number.isFinite(value) || value <= 0) return total
			return total + value
		}, 0)
		const laborCost = Number(ticket?.laborCost ?? 0)
		const safeLaborCost =
			Number.isFinite(laborCost) && laborCost > 0 ? laborCost : 0
		const invoiceTotal = selectedPartsTotal + safeLaborCost

		doc.save()
		doc.rect(left, doc.y, width, 132).fill('#102434')
		doc.restore()

		doc.font('Helvetica-Bold')
			.fontSize(7)
			.fillColor('#b9d4e5')
			.text(reportTitle, left + 14, doc.page.margins.top + 12)
		doc.font('Helvetica-Bold')
			.fontSize(24)
			.fillColor('#ffffff')
			.text(serviceTitle, left + 14, doc.page.margins.top + 26, {
				width: width - 28,
			})
		doc.font('Helvetica')
			.fontSize(10)
			.fillColor('#d8e7f1')
			.text(
				`${normalizeText(ticket.service_category) || 'Service'} | ${status} | Priority: ${normalizeText(ticket.priority) || 'N/A'}`,
				left + 14,
				doc.page.margins.top + 58,
			)
		doc.font('Helvetica')
			.fontSize(8)
			.fillColor('#b9d4e5')
			.text(
				`${customerName} | ${vesselName}`,
				left + 14,
				doc.page.margins.top + 74,
			)

		const metricTop = doc.page.margins.top + 94
		const metricWidth = (width - 28) / 4
		const metrics = [
			{ label: 'TICKET ID', value: ticketRef },
			{
				label: 'SCHEDULED',
				value: formatPdfDateShort(ticket?.scheduledDate),
			},
			{ label: 'GENERATED', value: formatPdfDateShort(new Date()) },
			{ label: 'INVOICE TOTAL', value: formatCurrencyUsd(invoiceTotal) },
		]

		metrics.forEach((metric, index) => {
			const x = left + 14 + metricWidth * index
			doc.font('Helvetica-Bold')
				.fontSize(6)
				.fillColor('#8db1c7')
				.text(metric.label, x, metricTop)
			doc.font('Helvetica-Bold')
				.fontSize(10)
				.fillColor('#ffffff')
				.text(metric.value, x, metricTop + 10, {
					width: metricWidth - 8,
				})
		})

		doc.y = doc.page.margins.top + 148

		const statementWidth = width
		const statementTextWidth = statementWidth - 24
		const statementHeight = doc.heightOfString(reportContext, {
			width: statementTextWidth,
			lineGap: 2,
		})
		const statementBoxHeight = Math.max(78, statementHeight + 32)

		doc.save()
		doc.roundedRect(
			left,
			doc.y,
			statementWidth,
			statementBoxHeight,
			8,
		).fillAndStroke('#ffffff', '#1e3a5f')
		doc.restore()
		doc.font('Helvetica-Bold')
			.fontSize(7)
			.fillColor('#64748b')
			.text('STATEMENT OF SERVICE', left + 12, doc.y + 10)
		doc.font('Helvetica')
			.fontSize(10)
			.fillColor('#0f172a')
			.text(reportContext, left + 12, doc.y + 24, {
				width: statementTextWidth,
				lineGap: 2,
			})

		doc.y += statementBoxHeight + 12

		doc.font('Helvetica-Bold')
			.fontSize(11)
			.fillColor('#0f172a')
			.text('TICKET SUMMARY')
		doc.moveDown(0.2)
		addBullets(doc, [
			`Ticket ID: ${ticketRef}`,
			`Created: ${formatPdfDate(ticket?.createdAt)}`,
			`Scheduled: ${formatPdfDate(ticket?.scheduledDate)}`,
			`Customer: ${customerName}`,
			`Customer Email: ${customerEmail}`,
			`Vessel: ${vesselName}`,
		])

		addH3(doc, 'Initial Assessment')
		addBullets(doc, [
			normalizeText(ticket?.initialAssessment) ||
				'No initial assessment provided.',
		])

		addH3(doc, 'Recommended Service')
		addBullets(doc, [
			normalizeText(ticket?.recommendedService) ||
				'No recommended service provided.',
		])

		addH3(doc, 'Work Performed')
		addBullets(doc, [
			normalizeText(ticket?.summaryOfWorkPerformed) ||
				'No work performed summary provided.',
		])

		addH3(doc, 'Further Recommendations')
		addBullets(doc, [
			normalizeText(ticket?.summaryOfFurtherRecommendations) ||
				normalizeText(ticket?.recommendedService) ||
				'No further recommendations provided.',
		])

		addH3(doc, 'Diagnostics Findings')
		const diagnostics = getTicketDiagnosticFindings(ticket)
		addBullets(
			doc,
			diagnostics.length
				? diagnostics
				: ['No abnormal findings recorded.'],
		)

		addH3(doc, 'Plan of Action')
		const planItems = Array.isArray(ticket.planOfAction)
			? ticket.planOfAction
			: []
		addBullets(
			doc,
			planItems.length
				? planItems.map(
						(item) =>
							`${item?.completed ? '[x]' : '[ ]'} ${normalizeText(item?.text) || 'Untitled task'}`,
					)
				: ['No plan items added.'],
		)

		addH3(doc, 'Invoice Summary')
		const partLines = selectedParts.map(
			(part) =>
				`${normalizeText(part?.text) || 'Unnamed part'} - ${formatCurrencyUsd(part?.cost)}`,
		)
		addBullets(doc, [
			`Selected Parts Total: ${formatCurrencyUsd(selectedPartsTotal)}`,
			`Labor Cost: ${formatCurrencyUsd(safeLaborCost)}`,
			`Invoice Total: ${formatCurrencyUsd(invoiceTotal)}`,
			...(partLines.length
				? partLines
				: ['No completed parts selected for billing.']),
		])

		addH3(doc, 'Notes History')
		const noteEntries = splitHistoryNotes(ticket.notes)
		addBullets(
			doc,
			noteEntries.length ? noteEntries : ['No notes have been added.'],
		)

		addDossierFooter(doc, companyProfile)

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
		const vesselHistory = Array.isArray(tickets)
			? [...tickets].sort(
					(a, b) =>
						new Date(a?.scheduledDate || 0).getTime() -
						new Date(b?.scheduledDate || 0).getTime(),
				)
			: []
		const ownerName =
			normalizeText(customer?.name) ||
			normalizeText(vessel?.customerName) ||
			'Unknown owner'
		const ownerPhone =
			normalizeText(vessel?.customerPhone) ||
			normalizeText(customer?.phone) ||
			'N/A'
		const documentedIssueCount = vesselHistory.reduce(
			(total, ticket) =>
				total + getTicketDiagnosticFindings(ticket).length,
			0,
		)
		const reportRange = formatDateRangeLabel(vesselHistory)
		const generatedLabel = formatPdfDateShort(new Date())
		const statementBody = interpolateTemplate(
			'This document represents the services and maintenance history on record for {{VESSEL}} as serviced and coordinated by {{COMPANY}} from {{RANGE}}. It includes chronological service entries and detailed notes to support vessel reliability and maintenance planning.',
			{
				VESSEL: vesselName,
				COMPANY: getCompanyProfile().name,
				RANGE: reportRange,
			},
		)
		const companyProfile = getCompanyProfile()
		let isRenderingFooter = false

		doc.on('pageAdded', () => {
			if (isRenderingFooter) return
			isRenderingFooter = true
			addDossierFooter(doc, companyProfile)
			isRenderingFooter = false
		})

		const left = doc.page.margins.left
		const width =
			doc.page.width - doc.page.margins.left - doc.page.margins.right

		doc.save()
		doc.rect(left, doc.y, width, 144).fill('#102434')
		doc.restore()

		doc.font('Helvetica-Bold')
			.fontSize(7)
			.fillColor('#b9d4e5')
			.text(
				'DOCUMENTED VESSEL HISTORY',
				left + 14,
				doc.page.margins.top + 12,
			)

		doc.font('Helvetica-Bold')
			.fontSize(28)
			.fillColor('#ffffff')
			.text(vesselName, left + 14, doc.page.margins.top + 26, {
				width: width - 28,
				lineBreak: false,
			})

		doc.font('Helvetica')
			.fontSize(10)
			.fillColor('#d8e7f1')
			.text(
				`${vesselYear || 'Unknown year'} ${vesselMake || ''} | Owner: ${ownerName}`.trim(),
				left + 14,
				doc.page.margins.top + 62,
			)
		doc.font('Helvetica')
			.fontSize(8)
			.fillColor('#b9d4e5')
			.text(
				`Generated ${generatedLabel}`,
				left + 14,
				doc.page.margins.top + 78,
			)

		const metricTop = doc.page.margins.top + 100
		const metricWidth = (width - 28) / 4
		const metricData = [
			{ label: 'REPORTS ON FILE', value: String(vesselHistory.length) },
			{ label: 'COVERAGE', value: reportRange },
			{
				label: 'ENGINE HOURS',
				value: normalizeText(vessel?.engineHours) || 'N/A',
			},
			{
				label: 'DOCUMENTED REPAIRS',
				value: String(documentedIssueCount),
			},
		]

		metricData.forEach((entry, index) => {
			const x = left + 14 + metricWidth * index
			doc.font('Helvetica-Bold')
				.fontSize(6)
				.fillColor('#8db1c7')
				.text(entry.label, x, metricTop)
			doc.font('Helvetica-Bold')
				.fontSize(11)
				.fillColor('#ffffff')
				.text(entry.value, x, metricTop + 10, {
					width: metricWidth - 8,
				})
		})

		doc.y = doc.page.margins.top + 160

		const statementWidth = width
		const statementTextWidth = statementWidth - 24
		const statementHeight = doc.heightOfString(statementBody, {
			width: statementTextWidth,
			lineGap: 2,
		})
		const statementBoxHeight = Math.max(96, statementHeight + 36)

		doc.save()
		doc.roundedRect(
			left,
			doc.y,
			statementWidth,
			statementBoxHeight,
			8,
		).fillAndStroke('#ffffff', '#1e3a5f')
		doc.restore()
		doc.font('Helvetica-Bold')
			.fontSize(7)
			.fillColor('#64748b')
			.text('STATEMENT OF DOCUMENTED SERVICE', left + 12, doc.y + 10)
		doc.font('Helvetica')
			.fontSize(10)
			.fillColor('#0f172a')
			.text(statementBody, left + 12, doc.y + 24, {
				width: statementTextWidth,
				lineGap: 2,
			})

		doc.y += statementBoxHeight + 12

		doc.font('Helvetica-Bold')
			.fontSize(11)
			.fillColor('#0f172a')
			.text('DETAILED SERVICE RECORDS')
		doc.moveDown(0.12)
		drawDetailedServiceCards(doc, vesselHistory)

		addDossierFooter(doc, companyProfile)

		doc.end()
	})

export const registerUser = async (req, res) => {
	try {
		const name = normalizeText(req.body?.name)
		const email = normalizeEmail(req.body?.email)
		const password = normalizeText(req.body?.password)

		if (!name || !email || !password) {
			return sendError(res, 400, 'Name, email, and password are required')
		}

		const passwordError = validatePassword(password)
		if (passwordError) {
			return sendError(res, 400, passwordError)
		}

		const existing = await User.findOne({ email })
		if (existing) {
			return sendError(
				res,
				409,
				'An account already exists for this email',
			)
		}

		const passwordHash = await bcrypt.hash(password, 12)
		const user = await User.create({
			id: randomUUID(),
			name,
			email,
			passwordHash,
		})

		const publicUser = toPublicUser(user)
		const token = createAuthToken({
			userId: publicUser.id,
			email: publicUser.email,
			role: publicUser.role,
		})

		res.status(201).json({ token, user: publicUser })
	} catch (error) {
		console.error('Failed to register user:', error)
		const message = error instanceof Error ? error.message : String(error)
		const isConfigError = message.includes('JWT_SECRET')
		if (isConfigError) {
			return sendError(res, 500, message)
		}

		sendError(res, 500, message || 'Failed to register user')
	}
}

export const loginUser = async (req, res) => {
	try {
		const email = normalizeEmail(req.body?.email)
		const password = normalizeText(req.body?.password)

		if (!email || !password) {
			return sendError(res, 400, 'Email and password are required')
		}

		const user = await User.findOne({ email }).select('+passwordHash')
		if (!user) {
			return sendError(res, 401, 'Invalid email or password')
		}

		const isValidPassword = await bcrypt.compare(
			password,
			user.passwordHash,
		)
		if (!isValidPassword) {
			return sendError(res, 401, 'Invalid email or password')
		}

		const publicUser = toPublicUser(user)
		const token = createAuthToken({
			userId: publicUser.id,
			email: publicUser.email,
			role: publicUser.role,
		})

		res.status(200).json({ token, user: publicUser })
	} catch (error) {
		console.error('Failed to login user:', error)
		const message = error instanceof Error ? error.message : String(error)
		const isConfigError = message.includes('JWT_SECRET')
		if (isConfigError) {
			return sendError(res, 500, message)
		}

		sendError(res, 500, message || 'Failed to login user')
	}
}

export const getAuthenticatedUser = async (req, res) => {
	try {
		const authUserId = normalizeText(req.authUser?.userId)
		if (!authUserId) {
			return sendError(res, 401, 'Authentication required')
		}

		const user = await User.findOne(toEntityQuery(authUserId))
		if (!user) {
			return sendError(res, 404, 'Authenticated user not found')
		}

		res.status(200).json({ user: toPublicUser(user) })
	} catch (error) {
		console.error('Failed to fetch authenticated user:', error)
		sendError(res, 500, 'Failed to fetch authenticated user')
	}
}

export const getUsers = async (req, res) => {
	try {
		const users = await User.find().sort({ name: 1 })
		res.status(200).json(users.map(toPublicUser))
	} catch (error) {
		console.error('Failed to fetch users:', error)
		sendError(res, 500, 'Failed to fetch users')
	}
}

export const getConversationList = async (req, res) => {
	try {
		const authUserId = normalizeText(req.authUser?.userId)
		const [tickets, reminders] = await Promise.all([
			Ticket.find()
				.select(
					'id _id service_title service_category status scheduledDate messages',
				)
				.lean(),
			Reminder.find()
				.select('id _id title dueDate completed relatedTo messages')
				.lean(),
		])

		const conversations = [
			...tickets
				.map((ticket) =>
					buildConversationSummary('ticket', ticket, authUserId),
				)
				.filter(Boolean),
			...reminders
				.map((reminder) =>
					buildConversationSummary('reminder', reminder, authUserId),
				)
				.filter(Boolean),
		].sort(
			(a, b) =>
				new Date(b.lastMessageAt || 0).getTime() -
				new Date(a.lastMessageAt || 0).getTime(),
		)

		res.status(200).json(conversations)
	} catch (error) {
		console.error('Failed to fetch conversations:', error)
		sendError(res, 500, 'Failed to fetch conversations')
	}
}

export const getConversation = async (req, res) => {
	try {
		const type = normalizeText(req.params.type).toLowerCase()
		const entityId = normalizeText(req.params.id)
		const model = getConversationModel(type)
		if (!model) {
			return sendError(
				res,
				400,
				'Conversation type must be ticket or reminder',
			)
		}

		const record = await model
			.findOne(getConversationQuery(type, entityId))
			.lean()
		if (!record) {
			return sendError(
				res,
				404,
				`${type === 'ticket' ? 'Ticket' : 'Reminder'} not found`,
			)
		}

		res.status(200).json(buildConversationRecord(type, record))
	} catch (error) {
		console.error('Failed to fetch conversation:', error)
		sendError(res, 500, 'Failed to fetch conversation')
	}
}

export const markConversationRead = async (req, res) => {
	try {
		const authUserId = normalizeText(req.authUser?.userId)
		if (!authUserId) {
			return sendError(res, 401, 'Authentication required')
		}

		const type = normalizeText(req.params.type).toLowerCase()
		const entityId = normalizeText(req.params.id)
		const model = getConversationModel(type)
		if (!model) {
			return sendError(
				res,
				400,
				'Conversation type must be ticket or reminder',
			)
		}

		const record = await model.findOne(getConversationQuery(type, entityId))
		if (!record) {
			return sendError(
				res,
				404,
				`${type === 'ticket' ? 'Ticket' : 'Reminder'} not found`,
			)
		}

		const changed = markConversationMessagesRead(record, authUserId)
		if (changed) {
			record.markModified('messages')
			await record.save()
		}

		const conversation = buildConversationRecord(type, record.toObject())
		if (changed) {
			emitConversationUpdated(conversation, [authUserId])
		}

		res.status(200).json(conversation)
	} catch (error) {
		console.error('Failed to mark conversation as read:', error)
		sendError(res, 500, 'Failed to mark conversation as read')
	}
}

export const archiveConversation = async (req, res) => {
	try {
		const authUserId = normalizeText(req.authUser?.userId)
		if (!authUserId) {
			return sendError(res, 401, 'Authentication required')
		}

		const type = normalizeText(req.params.type).toLowerCase()
		const entityId = normalizeText(req.params.id)
		const model = getConversationModel(type)
		if (!model) {
			return sendError(
				res,
				400,
				'Conversation type must be ticket or reminder',
			)
		}

		const record = await model.findOne(getConversationQuery(type, entityId))
		if (!record) {
			return sendError(
				res,
				404,
				`${type === 'ticket' ? 'Ticket' : 'Reminder'} not found`,
			)
		}

		const changed = archiveConversationForUser(record, authUserId)
		if (changed) {
			record.markModified('archivedByUserIds')
			await record.save()
			emitConversationUpdated(
				buildConversationRecord(type, record.toObject()),
				[authUserId],
			)
		}

		res.status(200).json({
			archived: true,
			conversationId: `${type}:${normalizeText(record.id || record._id)}`,
		})
	} catch (error) {
		console.error('Failed to archive conversation:', error)
		sendError(res, 500, 'Failed to archive conversation')
	}
}

export const deleteConversationMessage = async (req, res) => {
	try {
		const type = normalizeText(req.params.type).toLowerCase()
		const entityId = normalizeText(req.params.id)
		const messageId = normalizeText(req.params.messageId)
		const model = getConversationModel(type)
		if (!model) {
			return sendError(
				res,
				400,
				'Conversation type must be ticket or reminder',
			)
		}

		if (!messageId) {
			return sendError(res, 400, 'Message id is required')
		}

		const record = await model.findOne(getConversationQuery(type, entityId))
		if (!record) {
			return sendError(
				res,
				404,
				`${type === 'ticket' ? 'Ticket' : 'Reminder'} not found`,
			)
		}

		const existingMessages = normalizeConversationMessages(record.messages)
		const nextMessages = existingMessages.filter(
			(entry) => entry.id !== messageId,
		)

		if (nextMessages.length === existingMessages.length) {
			return sendError(res, 404, 'Message not found')
		}

		record.messages = nextMessages
		if (!nextMessages.length) {
			clearConversationArchiveForParticipants(
				record,
				collectConversationParticipantIds(existingMessages),
			)
			record.markModified('archivedByUserIds')
		}
		record.markModified('messages')
		await record.save()

		const conversation = buildConversationRecord(type, record.toObject())
		emitConversationUpdatedToAll(conversation)

		res.status(200).json({
			deleted: true,
			messageId,
			conversation,
		})
	} catch (error) {
		console.error('Failed to delete conversation message:', error)
		sendError(res, 500, 'Failed to delete conversation message')
	}
}

export const deleteConversation = async (req, res) => {
	try {
		const type = normalizeText(req.params.type).toLowerCase()
		const entityId = normalizeText(req.params.id)
		const model = getConversationModel(type)
		if (!model) {
			return sendError(
				res,
				400,
				'Conversation type must be ticket or reminder',
			)
		}

		const record = await model.findOne(getConversationQuery(type, entityId))
		if (!record) {
			return sendError(
				res,
				404,
				`${type === 'ticket' ? 'Ticket' : 'Reminder'} not found`,
			)
		}

		const participantIds = collectConversationParticipantIds(
			record.messages,
		)
		record.messages = []
		clearConversationArchiveForParticipants(record, participantIds)
		record.markModified('messages')
		record.markModified('archivedByUserIds')
		await record.save()

		emitConversationUpdatedToAll(
			buildConversationRecord(type, record.toObject()),
		)

		res.status(200).json({
			deleted: true,
			conversationId: `${type}:${normalizeText(record.id || record._id)}`,
		})
	} catch (error) {
		console.error('Failed to delete conversation:', error)
		sendError(res, 500, 'Failed to delete conversation')
	}
}

export const postConversationMessage = async (req, res) => {
	try {
		const authUserId = normalizeText(req.authUser?.userId)
		if (!authUserId) {
			return sendError(res, 401, 'Authentication required')
		}

		const type = normalizeText(req.params.type).toLowerCase()
		const entityId = normalizeText(req.params.id)
		const text = normalizeText(req.body?.text)
		const model = getConversationModel(type)

		if (!model) {
			return sendError(
				res,
				400,
				'Conversation type must be ticket or reminder',
			)
		}

		if (!entityId) {
			return sendError(res, 400, 'Conversation id is required')
		}

		if (!text) {
			return sendError(res, 400, 'Message text is required')
		}

		const [senderUser, record] = await Promise.all([
			User.findOne(toEntityQuery(authUserId)),
			model.findOne(getConversationQuery(type, entityId)),
		])

		if (!senderUser) {
			return sendError(res, 404, 'Sending user not found')
		}

		if (!record) {
			return sendError(
				res,
				404,
				`${type === 'ticket' ? 'Ticket' : 'Reminder'} not found`,
			)
		}

		const nextMessage = {
			id: randomUUID(),
			senderId: normalizeText(senderUser.id || senderUser._id),
			senderName:
				normalizeText(senderUser.name) ||
				normalizeEmail(senderUser.email),
			recipientId: '',
			recipientName: '',
			sender:
				normalizeText(senderUser.name) ||
				normalizeEmail(senderUser.email),
			text,
			timestamp: new Date(),
			readByUserIds: [normalizeText(senderUser.id || senderUser._id)],
		}

		clearConversationArchiveForParticipants(record, [
			normalizeText(senderUser.id || senderUser._id),
		])
		record.messages = [
			...normalizeConversationMessages(record.messages),
			nextMessage,
		]
		record.markModified('messages')
		record.markModified('archivedByUserIds')
		await record.save()
		const conversation = buildConversationRecord(type, record.toObject())
		emitConversationUpdatedToAll(conversation)

		res.status(201).json({
			message: normalizeConversationMessage(nextMessage),
			conversation,
		})
	} catch (error) {
		console.error('Failed to send conversation message:', error)
		sendError(res, 500, 'Failed to send conversation message')
	}
}

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

export const getTicketProfile = async (req, res) => {
	try {
		const ticketId = String(req.params.id || req.query.id || '').trim()

		if (!ticketId) {
			return sendError(res, 400, 'Ticket ID is required')
		}

		const ticket = await Ticket.findOne(toTicketQuery(ticketId))

		if (!ticket) {
			return sendError(res, 404, 'Ticket not found')
		}

		res.status(200).json(ticket)
	} catch (error) {
		console.error('Failed to fetch ticket profile:', error)
		sendError(res, 500, 'Failed to fetch ticket profile')
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
		const tickets = await Ticket.find()
			.select('-initialAssessmentPhotos -summaryOfWorkPerformedPhotos')
			.sort({ createdAt: -1 })
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
		const statusLabel = normalizeText(ticket.status)
		const isFinalInvoice = normalizeForComparison(statusLabel) === 'closed'
		const subjectPrefix = isFinalInvoice
			? 'CMP Garage final invoice'
			: 'CMP Garage progress update'
		const attachmentPrefix = isFinalInvoice
			? 'ticket-final-invoice'
			: 'ticket-progress'
		const introLine = isFinalInvoice
			? 'Attached is your final service invoice and completed work summary.'
			: 'Attached is the latest progress update for your service ticket.'

		await transporter.sendMail({
			from: fromAddress,
			to: customerEmail,
			subject: `${subjectPrefix}: ${normalizeText(ticket.service_title) || ticketRef}`,
			text:
				`Hello ${normalizeText(customer.name) || 'Customer'},\n\n` +
				`${introLine}\n\n` +
				`Ticket: ${normalizeText(ticket.service_title) || ticketRef}\n` +
				`Status: ${statusLabel || 'N/A'}\n\n` +
				`Thank you,\nCMP Garage`,
			attachments: [
				{
					filename: `${attachmentPrefix}-${ticketRef}.pdf`,
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

export const previewTicketProgress = async (req, res) => {
	try {
		const ticketId = String(req.params.id || '').trim()
		if (!ticketId) {
			return sendError(res, 400, 'Ticket id is required')
		}

		const ticket = await Ticket.findOne(toTicketQuery(ticketId)).lean()
		if (!ticket) {
			return sendError(res, 404, 'Ticket not found')
		}

		const customerId = normalizeText(ticket.customerId)
		const customer = customerId
			? await Customer.findOne(toEntityQuery(customerId)).lean()
			: null

		const vesselId = normalizeText(ticket.vesselId)
		const vessel = vesselId
			? await Vessel.findOne(toEntityQuery(vesselId)).lean()
			: null

		const pdfBuffer = await createTicketPdfBuffer({
			ticket,
			customer,
			vessel,
		})

		const ticketRef = normalizeText(ticket.id || ticket._id) || 'ticket'
		const isFinalInvoice =
			normalizeForComparison(ticket.status) === 'closed'
		const filePrefix = isFinalInvoice
			? 'ticket-final-invoice'
			: 'ticket-progress'

		res.status(200)
			.setHeader('Content-Type', 'application/pdf')
			.setHeader(
				'Content-Disposition',
				`inline; filename="${filePrefix}-${ticketRef}.pdf"`,
			)
			.send(pdfBuffer)
	} catch (error) {
		console.error('Failed to generate ticket preview:', error)
		const message = error instanceof Error ? error.message : String(error)
		sendError(res, 500, message || 'Failed to generate ticket preview')
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

		const customer = await findCustomerForVessel(vessel)
		if (!customer) {
			return sendError(
				res,
				404,
				'Customer for this vessel was not found. Update the vessel owner linkage or customer contact details.',
			)
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

		const customer = await findCustomerForVessel(vessel)
		if (!customer) {
			return sendError(
				res,
				404,
				'Customer for this vessel was not found. Update the vessel owner linkage or customer contact details.',
			)
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
