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
const diagnositicSchema = new Schema(
	{
		engine_oil: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		gear_lube: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		fuel_system: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		cooling_system: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		propeller_hardware: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		anodes_engine_drive: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		belts_hoses: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		steering_engine_mount_hardware: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		battery_voltage: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		terminals_connections: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		charger_shore_power: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		bilge_pump: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		navigation_anchorLights: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		ham_electronics_powerUp: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		hull_gellcoat: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		throughHull_seacocks: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		hull_trimTab_anodes: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		bottom_paint_growth: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		trim_tabs_operation: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		liftCables_pulleys: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		liftMotors_switches: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		bunks_guidePosts: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		dockLines_chafePoints: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		steeringFluid_operation: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		liveWell_washdownPumps: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		freshwater_system: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		head_waste_system: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		hatches_latches_drains: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		upholstery_canvas: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
		safety_equipment_check: {
			type: String,
			enum: ['good', 'monitor', 'action', 'N/A'],
		},
	},
	{ _id: false },
)

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
		engineHorsepower: { type: Number, required: true },
		engineHours: { type: Number, required: true },
		registrationDate: { type: Date, default: Date.now },
	},
	{ collection: 'BoatsCollection' },
)

// -------------------- reminder --------------------
const reminderSchema = new Schema(
	{
		title: { type: String, required: true },
		dueDate: { type: Date },
		completed: { type: Boolean, default: false },
		notes: { type: String, default: '' },
		relatedTo: {
			type: {
				type: String,
				enum: ['customer', 'vessel', 'ticket', 'other'],
				required: true,
			},
			id: { type: String, required: true },
		},
	},
	{ collection: 'RemindersCollection' },
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

const planActionItemSchema = new Schema(
	{
		id: { type: String, required: true },
		text: { type: String, required: true },
		completed: { type: Boolean, default: false },
	},
	{ _id: false },
)

const requiredPartItemSchema = new Schema(
	{
		id: { type: String, required: true },
		text: { type: String, required: true },
		completed: { type: Boolean, default: false },
		cost: { type: Number, default: 0 },
	},
	{ _id: false },
)

const ticketPhotoAttachmentSchema = new Schema(
	{
		id: { type: String, required: true },
		name: { type: String, required: true },
		uploadedAt: { type: Date, required: true },
		dataUrl: { type: String, required: true },
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
		service_category: {
			type: String,
			enum: ['inspection', 'repair', 'maintenance', 'upgrade'],
			required: true,
		},
		service_title: { type: String, required: true },
		status: {
			type: String,
			enum: [
				'open',
				'in progress',
				'completed',
				'closed',
				'cancelled',
				'on hold',
			],
			required: true,
		},
		priority: {
			type: String,
			enum: ['low', 'medium', 'high'],
			required: true,
		},
		createdAt: { type: Date, default: Date.now },
		scheduledDate: { type: Date, required: true },
		notes: { type: String, default: '' },
		initialAssessment: { type: String, default: '' },
		initialAssessmentPhotos: {
			type: [ticketPhotoAttachmentSchema],
			default: [],
		},
		recommendedService: { type: String, default: '' },
		summaryOfWorkPerformed: { type: String, default: '' },
		summaryOfWorkPerformedPhotos: {
			type: [ticketPhotoAttachmentSchema],
			default: [],
		},
		laborCost: { type: Number, default: 0 },
		summaryOfFurtherRecommendations: { type: String, default: '' },
		planOfAction: { type: [planActionItemSchema], default: [] },
		requiredParts: { type: [requiredPartItemSchema], default: [] },
		messages: [messageSchema],
		diagnostics: diagnositicSchema,
	},
	{ collection: 'TicketsCollection' },
)

// -------------------- Exports --------------------
export const Customer = mongoose.model('Customer', customerSchema)
export const Vessel = mongoose.model('Vessel', vesselSchema)
export const Reminder = mongoose.model('Reminder', reminderSchema)
export const Ticket = mongoose.model('Ticket', ticketSchema)
