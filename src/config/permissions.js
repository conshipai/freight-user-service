const PERMISSION_HIERARCHY = {
  system_admin: {
    canManage: ['conship_employee', 'customer', 'foreign_partner'],
    defaultModules: [
      { moduleId: 'quotes', name: 'Quotes & Pricing', permissions: ['read', 'write', 'delete', 'admin'] },
      { moduleId: 'tracking', name: 'Shipment Tracking', permissions: ['read', 'write', 'delete', 'admin'] },
      { moduleId: 'analytics', name: 'Analytics & Reports', permissions: ['read', 'write', 'delete', 'admin'] },
      { moduleId: 'users', name: 'User Management', permissions: ['read', 'write', 'delete', 'admin'] },
      { moduleId: 'billing', name: 'Billing & Invoicing', permissions: ['read', 'write', 'delete', 'admin'] },
      { moduleId: 'inventory', name: 'Inventory Management', permissions: ['read', 'write', 'delete', 'admin'] }
    ],
    canAssignAnyModule: true
  },
  conship_employee: {
    canManage: [],
    defaultModules: [
      { moduleId: 'quotes', name: 'Quotes & Pricing', permissions: ['read', 'write'] },
      { moduleId: 'tracking', name: 'Shipment Tracking', permissions: ['read', 'write'] },
      { moduleId: 'analytics', name: 'Analytics & Reports', permissions: ['read'] }
    ],
    canAssignAnyModule: false
  },
  customer: {
    canManage: ['customer_user'],
    defaultModules: [
      { moduleId: 'quotes', name: 'Quotes & Pricing', permissions: ['read', 'write'] },
      { moduleId: 'tracking', name: 'Shipment Tracking', permissions: ['read'] }
    ],
    canCreateSubUsers: true
  },
  foreign_partner: {
    canManage: ['foreign_partner_user'],
    defaultModules: [
      { moduleId: 'quotes', name: 'Quotes & Pricing', permissions: ['read', 'write'] },
      { moduleId: 'tracking', name: 'Shipment Tracking', permissions: ['read'] }
    ],
    canCreateSubUsers: true
  },
  customer_user: {
    canManage: [],
    defaultModules: [],
    inheritsFromParent: true
  },
  foreign_partner_user: {
    canManage: [],
    defaultModules: [],
    inheritsFromParent: true
  }
};

module.exports = { PERMISSION_HIERARCHY };
