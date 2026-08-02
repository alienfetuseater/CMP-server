import express from 'express'
import {
	registerUser,
	loginUser,
	forgotPassword,
	resetPassword,
	getAuthenticatedUser,
	getUsers,
	getUserAccess,
	updateUser,
	getConversationList,
	getConversation,
	markConversationRead,
	archiveConversation,
	deleteConversationMessage,
	deleteConversation,
	postConversationMessage,
	searchCustomersByName,
	searchVesselByName,
	getCustomerProfile,
	getBoatProfile,
	getTicketProfile,
	getTicket,
	getReminder,
	previewTicketProgress,
	previewVesselDossier,
	getAllCustomers,
	getAllBoats,
	getAllTickets,
	getAllReminders,
	newCustomer,
	newBoat,
	newTicket,
	newReminder,
	updateCustomer,
	updateBoat,
	updateTicket,
	emailVesselDossier,
	emailTicketProgress,
	updateReminder,
	deleteCustomer,
	deleteBoat,
	deleteTicket,
	deleteReminder,
	getAllMonthlyReports,
	getMonthlyReportProfile,
	newMonthlyReport,
	updateMonthlyReport,
	unlockMonthlyReport,
	previewMonthlyReport,
	emailMonthlyReport,
} from '../controllers.js/controllers.js'
import { requireAuth, requirePermission } from '../middleware/auth.js'

const router = express.Router()

router.post('/auth/login', loginUser)
router.post('/auth/forgot-password', forgotPassword)
router.post('/auth/reset-password', resetPassword)
router.get('/auth/me', requireAuth, getAuthenticatedUser)

router.use(requireAuth)

router.post('/auth/register', requirePermission('users:create'), registerUser)
router.get('/users/access', requirePermission('users:read'), getUserAccess)
router.get('/users', requirePermission('users:read'), getUsers)
router.put('/users/:id', requirePermission('users:assignRole'), updateUser)

router.get('/conversations', getConversationList)
router.get('/conversations/:type/:id', getConversation)
router.post('/conversations/:type/:id/read', markConversationRead)
router.post('/conversations/:type/:id/archive', archiveConversation)
router.post('/conversations/:type/:id/messages', postConversationMessage)
router.delete(
	'/conversations/:type/:id/messages/:messageId',
	deleteConversationMessage,
)
router.delete('/conversations/:type/:id', deleteConversation)

router.get('/searchCustomers', searchCustomersByName)
router.get('/searchVessels', searchVesselByName)

router.get('/getCustomerProfile', getCustomerProfile)
router.get('/getBoatProfile', getBoatProfile)
router.get('/getTicketProfile', getTicketProfile)
router.get('/getTicket', getTicket)
router.get('/getReminder', getReminder)

router.get('/getAllCustomers', getAllCustomers)
router.get('/getAllBoats', getAllBoats)
router.get('/getAllTickets', getAllTickets)
router.get('/getAllReminders', getAllReminders)

router.post('/newCustomer', newCustomer)
router.post('/newBoat', newBoat)
router.post('/newTicket', newTicket)
router.post('/newReminder', newReminder)
router.get('/previewTicketProgress/:id', previewTicketProgress)
router.get('/previewVesselDossier/:id', previewVesselDossier)
router.post('/emailVesselDossier/:id', emailVesselDossier)
router.post('/emailTicketProgress/:id', emailTicketProgress)

router.put('/updateCustomer/:id', updateCustomer)
router.put('/updateBoat/:id', updateBoat)
router.put('/updateTicket/:id', updateTicket)
router.put('/updateReminder/:id', updateReminder)

router.delete('/deleteCustomer/:id', deleteCustomer)
router.delete('/deleteBoat/:id', deleteBoat)
router.delete('/deleteTicket/:id', deleteTicket)
router.delete('/deleteReminder/:id', deleteReminder)

router.get('/getAllMonthlyReports', getAllMonthlyReports)
router.get('/getMonthlyReportProfile', getMonthlyReportProfile)
router.post('/newMonthlyReport', newMonthlyReport)
router.put('/updateMonthlyReport/:id', updateMonthlyReport)
router.put('/unlockMonthlyReport/:id', unlockMonthlyReport)
router.get('/previewMonthlyReport/:id', previewMonthlyReport)
router.post('/emailMonthlyReport/:id', emailMonthlyReport)

export default router
