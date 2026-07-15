import mongoose from 'mongoose'

const { Schema } = mongoose

// -------------------- Customer --------------------
const customerSchema = new Schema(
	{
		name: { type: String, required: true },
		phone: { type: String, required: true },
		email: { type: String, required: true },
		address: { type: String, required: true },
		createdAt: { type: Date, default: Date.now },
		vesselIds: [{ type: Schema.Types.ObjectId, ref: 'Vessel' }],
	},
	{ collection: 'CustomersCollection' },
)

// -------------------- Vessel --------------------
const vesselSchema = new Schema(
	{
		customerId: {
			type: Schema.Types.ObjectId,
			ref: 'Customer',
			required: true,
		},
		owner: String,
		customerName: { type: String, required: true },
		customerPhone: { type: String, required: true },
		vesselName: { type: String, required: true },
		vesselMake: { type: String, required: true },
		vesselYear: { type: Number, required: true },
		hullIdNumber: { type: String, required: true },
		numberOfEngines: { type: Number, required: true },
		engineSerialNumbers: [{ type: String }],
		generator: { type: Boolean, required: true },
		boatLocation: {
			type: String,
			enum: ['trailor', 'slip', 'dry dock'],
			required: true,
		},
		engineMake: { type: String, required: true },
		engineModel: { type: String, required: true },
		engineHours: { type: Number, required: true },
	},
	{ collection: 'BoatsCollection' },
)

// -------------------- Todo --------------------
const todoSchema = new Schema(
	{
		title: { type: String, required: true },
		dueDate: { type: Date, required: true },
		completed: { type: Boolean, default: false },
		relatedTo: {
			type: {
				type: String,
				enum: ['customer', 'vessel', 'ticket'],
				required: true,
			},
			id: { type: Schema.Types.ObjectId, required: true },
		},
	},
	{ collection: 'ToDoCollection' },
)

// -------------------- Ticket + Embedded Messages --------------------
const messageSchema = new Schema(
	{
		sender: { type: String, required: true },
		text: { type: String, required: true },
		timestamp: { type: Date, default: Date.now },
	},
	{ _id: false },
)

const ticketSchema = new Schema(
	{
		customerId: {
			type: Schema.Types.ObjectId,
			ref: 'Customer',
			required: true,
		},
		vesselId: {
			type: Schema.Types.ObjectId,
			ref: 'Vessel',
			required: true,
		},
		title: { type: String, required: true },
		status: { type: String, required: true },
		priority: { type: String, required: true },
		createdAt: { type: Date, default: Date.now },
		scheduledDate: { type: Date, required: true },
		notes: { type: String, default: '' },
		messages: [messageSchema],
	},
	{ collection: 'TicketCollection' },
)

// -------------------- Exports --------------------
export const Customer = mongoose.model('Customer', customerSchema)
export const Vessel = mongoose.model('Vessel', vesselSchema)
export const Todo = mongoose.model('Todo', todoSchema)
export const Ticket = mongoose.model('Ticket', ticketSchema)
