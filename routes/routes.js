import express from 'express'
import {
	searchCustomersByName,
	searchVesselByName,
	getCustomerProfile,
	getBoatProfile,
	getTicket,
	getToDo,
	getAllCustomers,
	getAllBoats,
	getAllTickets,
	getAllToDos,
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

router.get('/searchCustomers', searchCustomersByName)
router.get('/searchVessels', searchVesselByName)

router.get('/getCustomerProfile', getCustomerProfile)
router.get('/getBoatProfile', getBoatProfile)
router.get('/getTicket', getTicket)
router.get('/getToDo', getToDo)

router.get('/getAllCustomers', getAllCustomers)
router.get('/getAllBoats', getAllBoats)
router.get('/getAllTickets', getAllTickets)
router.get('/getAllToDos', getAllToDos)

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
