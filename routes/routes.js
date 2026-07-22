import express from 'express'
import {
	searchCustomersByName,
	searchVesselByName,
	getCustomerProfile,
	getBoatProfile,
	getTicket,
	getReminder,
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

const router = express.Router()

router.get('/searchCustomers', searchCustomersByName)
router.get('/searchVessels', searchVesselByName)

router.get('/getCustomerProfile', getCustomerProfile)
router.get('/getBoatProfile', getBoatProfile)
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
