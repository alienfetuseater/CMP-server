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
		'directory:view',
		'customers:manage',
		'vessels:manage',
		'tickets:manage',
		'reports:manage',
		'assignments:delegate',
		'assignments:view',
		'reminders:view',
		'reminders:manage',
		'messages:manage',
		'records:delete',
		'documents:send',
	],
	serviceManager: [
		'users:create',
		'users:read',
		'calendar:view',
		'records:read',
		'directory:view',
		'customers:manage',
		'vessels:manage',
		'tickets:manage',
		'reports:manage',
		'assignments:delegate',
		'assignments:view',
		'reminders:view',
		'reminders:manage',
		'messages:manage',
		'records:delete',
		'documents:send',
	],
	technician: [
		'records:read',
		'tickets:update',
		'reports:update',
		'assignments:view',
		'reminders:view',
		'reminders:manage',
		'messages:manage',
	],
	coordinator: [
		'calendar:view',
		'records:read',
		'reports:create',
		'reports:update',
		'directory:view',
		'customers:manage',
		'vessels:manage',
		'tickets:create',
		'assignments:delegate',
		'assignments:view',
		'reminders:view',
		'reminders:manage',
		'messages:manage',
		'documents:send',
	],
	viewer: [
		'records:read',
		'directory:view',
		'reminders:view',
		'reminders:manage',
	],
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
