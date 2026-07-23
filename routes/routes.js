import express from 'express'
import {
	registerUser,
	loginUser,
	getAuthenticatedUser,
	getUsers,
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
} from '../controllers.js/controllers.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()

router.post('/auth/register', registerUser)
router.post('/auth/login', loginUser)
router.get('/auth/me', requireAuth, getAuthenticatedUser)

router.use(requireAuth)

router.get('/users', getUsers)

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

export default router
