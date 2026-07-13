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

export const getCustomerProfile = async (req, res) => {
	try {
		const customerId = req.params.id || req.query.id
		const customer = await Customer.findOne({ id: customerId })

		if (!customer) {
			return sendError(res, 404, 'Customer not found')
		}

		res.status(200).json(customer)
	} catch (error) {
		sendError(res, 500, 'Failed to fetch customer profile')
	}
}

export const getBoatProfile = async (req, res) => {
	try {
		const vesselId = req.params.id || req.query.id
		const vessel = await Vessel.findOne({ id: vesselId })

		if (!vessel) {
			return sendError(res, 404, 'Vessel not found')
		}

		res.status(200).json(vessel)
	} catch (error) {
		sendError(res, 500, 'Failed to fetch vessel profile')
	}
}

export const getTickets = async (req, res) => {
	try {
		const tickets = await Ticket.find().sort({ createdAt: -1 })
		res.status(200).json(tickets)
	} catch (error) {
		sendError(res, 500, 'Failed to fetch tickets')
	}
}

export const getToDos = async (req, res) => {
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
		sendError(res, 500, 'Failed to create customer')
	}
}

export const newBoat = async (req, res) => {
	try {
		const vessel = await Vessel.create(buildRecord(req.body))
		res.status(201).json(vessel)
	} catch (error) {
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
