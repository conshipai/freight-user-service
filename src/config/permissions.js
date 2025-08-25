// src/config/permissions.js

const PERMISSION_HIERARCHY = {
  system_admin: {
    canManage: ['conship_employee', 'conship_management', 'customer', 'foreign_partner'],
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

  conship_management: {
    canManage: ['conship_employee'],
    defaultModules: [
      { moduleId: 'quotes', name: 'Quotes & Pricing', permissions: ['read', 'write', 'delete'] },
      { moduleId: 'tracking', name: 'Shipment Tracking', permissions: ['read', 'write', 'delete'] },
      { moduleId: 'analytics', name: 'Analytics & Reports', permissions: ['read', 'write'] }
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
  },

  partner_user: {
    canManage: [],
    defaultModules: [{ moduleId: 'quotes', name: 'Quotes & Pricing', permissions: ['read'] }]
  }
};

module.exports = { PERMISSION_HIERARCHY };
