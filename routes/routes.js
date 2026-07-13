import express from 'express'
import {
	getCustomerProfile,
	getBoatProfile,
	getTickets,
	getToDos,
	newCustomer,
	newBoat,
	newTicket,
	newToDo,
	updateCustomer,
	updateBoat,
	updateTicket,
	updateToDo,
	deleteCustomer,
	deleteBoat,
	deleteTicket,
	deleteToDo,
} from '../controllers.js/controllers.js'

const router = express.Router()

router.get('/getCustomerProfile', getCustomerProfile)
router.get('/getBoatProfile', getBoatProfile)
router.get('/getTickets', getTickets)
router.get('/getToDos', getToDos)

router.post('/newCustomer', newCustomer)
router.post('/newBoat', newBoat)
router.post('/newTicket', newTicket)
router.post('/newToDo', newToDo)

router.put('/updateCustomer/:id', updateCustomer)
router.put('/updateBoat/:id', updateBoat)
router.put('/updateTicket/:id', updateTicket)
router.put('/updateToDo/:id', updateToDo)

router.delete('/deleteCustomer/:id', deleteCustomer)
router.delete('/deleteBoat/:id', deleteBoat)
router.delete('/deleteTicket/:id', deleteTicket)
router.delete('/deleteToDo/:id', deleteToDo)

export default router
