export const USER_ROLES = [
	'admin',
	'serviceManager',
	'technician',
	'coordinator',
	'viewer',
]

export const ROLE_PERMISSIONS = {
	admin: [
		'users:create',
		'users:read',
		'users:assignRole',
		'users:manageAdmins',
		'settings:manage',
		'calendar:view',
		'records:read',
		'customers:manage',
		'vessels:manage',
		'tickets:manage',
		'reports:manage',
		'reminders:manage',
		'messages:manage',
		'records:delete',
		'documents:send',
	],
	serviceManager: [
		'calendar:view',
		'records:read',
		'customers:manage',
		'vessels:manage',
		'tickets:manage',
		'reports:manage',
		'reminders:manage',
		'messages:manage',
		'records:delete',
		'documents:send',
	],
	technician: [
		'records:read',
		'tickets:update',
		'reports:create',
		'reports:update',
		'messages:manage',
	],
	coordinator: [
		'calendar:view',
		'records:read',
		'customers:manage',
		'vessels:manage',
		'tickets:create',
		'reminders:manage',
		'messages:manage',
		'documents:send',
	],
	viewer: ['records:read'],
}

export function normalizeUserRole(role) {
	if (role === 'user') return 'serviceManager'
	return USER_ROLES.includes(role) ? role : 'viewer'
}

export function isUserRole(role) {
	return USER_ROLES.includes(role)
}

export function hasPermission(role, permission) {
	return ROLE_PERMISSIONS[normalizeUserRole(role)].includes(permission)
}