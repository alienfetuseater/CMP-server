import { randomUUID } from 'crypto'
import { Customer, Vessel, Ticket, Todo } from '../models/models.js'

const sendError = (res, status, message) => {
	res.status(status).json({ error: message })
}

const buildRecord = (body, defaults = {}) => ({
	...defaults,
	...body,
	id: body.id || randomUUID(),
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

		const vessel = await Vessel.findById(vesselId)

		if (!vessel) {
			return sendError(res, 404, 'Vessel not found')
		}

		res.status(200).json(vessel)
	} catch (error) {
		console.error('Failed to fetch vessel profile:', error)
		sendError(res, 500, 'Failed to fetch vessel profile')
	}
}

export const getTicket = async (req, res) => {
	try {
		const ticket = await Ticket.find().sort({ createdAt: -1 })
		res.status(200).json(ticket)
	} catch (error) {
		sendError(res, 500, 'Failed to fetch ticket')
	}
}

export const getToDo = async (req, res) => {
	try {
		const todo = await Todo.find().sort({ dueDate: 1 })
		res.status(200).json(todo)
	} catch (error) {
		sendError(res, 500, 'Failed to fetch todo')
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

export const getAllToDos = async (req, res) => {
	try {
		const todos = await Todo.find().sort({ dueDate: 1 })
		res.status(200).json(todos)
	} catch (error) {
		sendError(res, 500, 'Failed to fetch todos')
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

export const newToDo = async (req, res) => {
	try {
		const todo = await Todo.create(buildRecord(req.body))
		res.status(201).json(todo)
	} catch (error) {
		sendError(res, 500, 'Failed to create todo')
	}
}

export const updateCustomer = async (req, res) => {
	try {
		const updated = await Customer.findOneAndUpdate(
			{ id: req.params.id },
			req.body,
			{
				new: true,
				runValidators: true,
			},
		)

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
		const updated = await Vessel.findOneAndUpdate(
			{ id: req.params.id },
			req.body,
			{
				new: true,
				runValidators: true,
			},
		)

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
		const updated = await Ticket.findOneAndUpdate(
			{ id: req.params.id },
			req.body,
			{
				new: true,
				runValidators: true,
			},
		)

		if (!updated) {
			return sendError(res, 404, 'Ticket not found')
		}

		res.status(200).json(updated)
	} catch (error) {
		sendError(res, 500, 'Failed to update ticket')
	}
}

export const updateToDo = async (req, res) => {
	try {
		const updated = await Todo.findOneAndUpdate(
			{ id: req.params.id },
			req.body,
			{
				new: true,
				runValidators: true,
			},
		)

		if (!updated) {
			return sendError(res, 404, 'Todo not found')
		}

		res.status(200).json(updated)
	} catch (error) {
		sendError(res, 500, 'Failed to update todo')
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

export const deleteToDo = async (req, res) => {
	try {
		const deleted = await Todo.findOneAndDelete({ id: req.params.id })

		if (!deleted) {
			return sendError(res, 404, 'Todo not found')
		}

		res.status(200).json({ message: 'Todo deleted' })
	} catch (error) {
		sendError(res, 500, 'Failed to delete todo')
	}
}
