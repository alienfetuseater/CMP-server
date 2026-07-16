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
