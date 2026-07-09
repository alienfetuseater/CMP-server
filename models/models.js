const mongoose = require('mongoose')

const { Schema } = mongoose

const customerSchema = new Schema(
	{
		id: { type: String, required: true, unique: true },
		name: { type: String, required: true },
		phone: { type: String, required: true },
		email: { type: String, required: true },
		address: { type: String, required: true },
		createdAt: { type: String, default: () => new Date().toISOString() },
		vesselIds: [{ type: String }],
	},
	{ collection: 'CustomerCollection' },
)

const vesselSchema = new Schema(
	{
		id: { type: String, required: true, unique: true },
		customerId: { type: String, required: true },
		owner: { type: String },
		customerName: { type: String, required: true },
		customerPhone: { type: String, required: true },
		vesselName: { type: String, required: true },
		vesselMake: { type: String, required: true },
		vesselYear: { type: Number, required: true },
		engineMake: { type: String, required: true },
		engineModel: { type: String, required: true },
		engineHours: { type: Number, required: true },
	},
	{ collection: 'BoatsCollection' },
)

const todoRelatedSchema = new Schema(
	{
		type: {
			type: String,
			enum: ['customer', 'vessel', 'ticket'],
			required: true,
		},
		id: { type: String, required: true },
	},
	{ _id: false },
)

const todoSchema = new Schema(
	{
		id: { type: String, required: true, unique: true },
		title: { type: String, required: true },
		dueDate: { type: String, required: true },
		completed: { type: Boolean, default: false },
		relatedTo: { type: todoRelatedSchema, required: true },
	},
	{ collection: 'ToDoCollection' },
)

const ticketSchema = new Schema(
	{
		id: { type: String, required: true, unique: true },
		customerId: { type: String, required: true },
		vesselId: { type: String, required: true },
		title: { type: String, required: true },
		status: { type: String, required: true },
		priority: { type: String, required: true },
		createdAt: { type: String, default: () => new Date().toISOString() },
		scheduledDate: { type: String, required: true },
		notes: { type: String, default: '' },
	},
	{ collection: 'TicketCollection' },
)

const todoDisplayItemSchema = new Schema(
	{
		id: { type: String, required: true, unique: true },
		title: { type: String, required: true },
		date: { type: String, required: true },
		completed: { type: Boolean, default: false },
		status: { type: String, required: true },
		type: { type: String, enum: ['todo', 'ticket'], required: true },
	},
	{ collection: 'todoDisplayItems' },
)

const messageSchema = new Schema(
	{
		sender: { type: String, required: true },
		text: { type: String, required: true },
		timestamp: { type: String, default: () => new Date().toISOString() },
	},
	{ _id: false },
)

const conversationSchema = new Schema(
	{
		id: { type: String, required: true, unique: true },
		messages: [{ type: messageSchema }],
	},
	{ collection: 'MessagesCollection' },
)

const Customer = mongoose.model('Customer', customerSchema)
const Vessel = mongoose.model('Vessel', vesselSchema)
const Todo = mongoose.model('Todo', todoSchema)
const Ticket = mongoose.model('Ticket', ticketSchema)
const TodoDisplayItem = mongoose.model('TodoDisplayItem', todoDisplayItemSchema)
const Message = mongoose.model('Message', messageSchema)
const Conversation = mongoose.model('Conversation', conversationSchema)

module.exports = {
	Customer,
	Vessel,
	Todo,
	Ticket,
	TodoDisplayItem,
	Message,
	Conversation,
}
