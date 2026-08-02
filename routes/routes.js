import express from 'express'
import {
	registerUser,
	loginUser,
	forgotPassword,
	resetPassword,
	getAuthenticatedUser,
	getUsers,
	getAssignableUsers,
	getAssignmentBoard,
	getUserAccess,
	getWorkspaceAccess,
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
import {
	requireAnyPermission,
	requireAuth,
	requirePermission,
} from '../middleware/auth.js'

const router = express.Router()

router.post('/auth/login', loginUser)
router.post('/auth/forgot-password', forgotPassword)
router.post('/auth/reset-password', resetPassword)
router.get('/auth/me', requireAuth, getAuthenticatedUser)

router.use(requireAuth)

router.post('/auth/register', requirePermission('users:create'), registerUser)
router.get('/users/access', requirePermission('users:read'), getUserAccess)
router.get(
	'/workspace/access',
	requirePermission('records:read'),
	getWorkspaceAccess,
)
router.get(
	'/assignments/access',
	requirePermission('assignments:delegate'),
	(req, res) => res.status(200).json({ canDelegate: true }),
)
router.get(
	'/assignments/board',
	requirePermission('assignments:view'),
	getAssignmentBoard,
)
router.get(
	'/assignments/board-access',
	requirePermission('assignments:view'),
	(req, res) => res.status(200).json({ canView: true }),
)
router.get(
	'/users/assignable',
	requirePermission('assignments:delegate'),
	getAssignableUsers,
)
router.get('/users', requirePermission('users:read'), getUsers)
router.put('/users/:id', requirePermission('users:assignRole'), updateUser)

router.get(
	'/conversations',
	requirePermission('messages:manage'),
	getConversationList,
)
router.get(
	'/conversations/:type/:id',
	requirePermission('messages:manage'),
	getConversation,
)
router.post(
	'/conversations/:type/:id/read',
	requirePermission('messages:manage'),
	markConversationRead,
)
router.post(
	'/conversations/:type/:id/archive',
	requirePermission('messages:manage'),
	archiveConversation,
)
router.post(
	'/conversations/:type/:id/messages',
	requirePermission('messages:manage'),
	postConversationMessage,
)
router.delete(
	'/conversations/:type/:id/messages/:messageId',
	requirePermission('messages:manage'),
	deleteConversationMessage,
)
router.delete(
	'/conversations/:type/:id',
	requirePermission('messages:manage'),
	deleteConversation,
)

router.get(
	'/searchCustomers',
	requirePermission('directory:view'),
	searchCustomersByName,
)
router.get(
	'/searchVessels',
	requirePermission('directory:view'),
	searchVesselByName,
)

router.get(
	'/getCustomerProfile',
	requirePermission('records:read'),
	getCustomerProfile,
)
router.get('/getBoatProfile', requirePermission('records:read'), getBoatProfile)
router.get(
	'/getTicketProfile',
	requirePermission('records:read'),
	getTicketProfile,
)
router.get('/getTicket', requirePermission('records:read'), getTicket)
router.get('/getReminder', requirePermission('reminders:view'), getReminder)

router.get(
	'/getAllCustomers',
	requirePermission('records:read'),
	getAllCustomers,
)
router.get('/getAllBoats', requirePermission('records:read'), getAllBoats)
router.get('/getAllTickets', requirePermission('records:read'), getAllTickets)
router.get(
	'/getAllReminders',
	requirePermission('reminders:view'),
	getAllReminders,
)

router.post('/newCustomer', requirePermission('customers:manage'), newCustomer)
router.post('/newBoat', requirePermission('vessels:manage'), newBoat)
router.post(
	'/newTicket',
	requireAnyPermission('tickets:manage', 'tickets:create'),
	newTicket,
)
router.post('/newReminder', requirePermission('reminders:manage'), newReminder)
router.get(
	'/previewTicketProgress/:id',
	requirePermission('records:read'),
	previewTicketProgress,
)
router.get(
	'/previewVesselDossier/:id',
	requirePermission('records:read'),
	previewVesselDossier,
)
router.post(
	'/emailVesselDossier/:id',
	requirePermission('documents:send'),
	emailVesselDossier,
)
router.post(
	'/emailTicketProgress/:id',
	requirePermission('documents:send'),
	emailTicketProgress,
)

router.put(
	'/updateCustomer/:id',
	requirePermission('customers:manage'),
	updateCustomer,
)
router.put('/updateBoat/:id', requirePermission('vessels:manage'), updateBoat)
router.put(
	'/updateTicket/:id',
	requireAnyPermission('tickets:manage', 'tickets:update'),
	updateTicket,
)
router.put(
	'/updateReminder/:id',
	requirePermission('reminders:manage'),
	updateReminder,
)

router.delete(
	'/deleteCustomer/:id',
	requirePermission('records:delete'),
	deleteCustomer,
)
router.delete(
	'/deleteBoat/:id',
	requirePermission('records:delete'),
	deleteBoat,
)
router.delete(
	'/deleteTicket/:id',
	requirePermission('records:delete'),
	deleteTicket,
)
router.delete(
	'/deleteReminder/:id',
	requirePermission('reminders:manage'),
	deleteReminder,
)

router.get(
	'/getAllMonthlyReports',
	requirePermission('records:read'),
	getAllMonthlyReports,
)
router.get(
	'/getMonthlyReportProfile',
	requirePermission('records:read'),
	getMonthlyReportProfile,
)
router.post(
	'/newMonthlyReport',
	requireAnyPermission('reports:manage', 'reports:create'),
	newMonthlyReport,
)
router.put(
	'/updateMonthlyReport/:id',
	requireAnyPermission('reports:manage', 'reports:update'),
	updateMonthlyReport,
)
router.put(
	'/unlockMonthlyReport/:id',
	requirePermission('reports:manage'),
	unlockMonthlyReport,
)
router.get(
	'/previewMonthlyReport/:id',
	requirePermission('records:read'),
	previewMonthlyReport,
)
router.post(
	'/emailMonthlyReport/:id',
	requirePermission('documents:send'),
	emailMonthlyReport,
)

export default router
