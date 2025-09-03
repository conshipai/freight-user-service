// src/config/permissions.js
const PERMISSION_HIERARCHY = {
  system_admin: {
    canManage: ['conship_employee', 'customer', 'customer_user', 'foreign_partner', 'foreign_partner_user', 'vendor_admin', 'vendor_user'],
    defaultModules: [
      { moduleId: 'quotes', name: 'Quotes & Pricing', permissions: ['read', 'write', 'delete', 'admin'] },
      { moduleId: 'tracking', name: 'Shipment Tracking', permissions: ['read', 'write', 'delete', 'admin'] },
      { moduleId: 'analytics', name: 'Analytics & Reports', permissions: ['read', 'write', 'delete', 'admin'] },
      { moduleId: 'users', name: 'User Management', permissions: ['read', 'write', 'delete', 'admin'] }
    ],
    canAssignAnyModule: true,
    hasFullAccess: true
  },
  conship_employee: {
    canManage: ['customer_user', 'foreign_partner_user'],
    defaultModules: [
      { moduleId: 'quotes', name: 'Quotes & Pricing', permissions: ['read', 'write'] },
      { moduleId: 'tracking', name: 'Shipment Tracking', permissions: ['read', 'write'] },
      { moduleId: 'analytics', name: 'Analytics & Reports', permissions: ['read'] }
    ],
    canAssignAnyModule: false
  },
  customer: { // Domestic partner admin
    canManage: ['customer_user'],
    defaultModules: [
      { moduleId: 'quotes', name: 'Quotes & Pricing', permissions: ['read', 'write'] },
      { moduleId: 'tracking', name: 'Shipment Tracking', permissions: ['read'] }
    ],
    canCreateSubUsers: true,
    partnerType: 'domestic'
  },
  customer_user: { // Domestic partner user
    canManage: [],
    defaultModules: [],
    inheritsFromParent: true,
    partnerType: 'domestic'
  },
  foreign_partner: { // Foreign partner admin
    canManage: ['foreign_partner_user'],
    defaultModules: [
      { moduleId: 'quotes', name: 'Quotes & Pricing', permissions: ['read', 'write'], restrictions: ['imports_only'] },
      { moduleId: 'tracking', name: 'Shipment Tracking', permissions: ['read'] }
    ],
    canCreateSubUsers: true,
    partnerType: 'foreign'
  },
  foreign_partner_user: { // Foreign partner user
    canManage: [],
    defaultModules: [],
    inheritsFromParent: true,
    partnerType: 'foreign'
  },
  vendor_admin: { // Future: Vendor admin
    canManage: ['vendor_user'],
    defaultModules: [
      { moduleId: 'rates', name: 'Rate Management', permissions: ['read', 'write'] },
      { moduleId: 'tracking', name: 'Shipment Tracking', permissions: ['read'] }
    ],
    canCreateSubUsers: true,
    partnerType: 'vendor'
  },
  vendor_user: { // Future: Vendor user
    canManage: [],
    defaultModules: [],
    inheritsFromParent: true,
    partnerType: 'vendor'
  }
};

const ROLES = {
  SYSTEM_ADMIN: 'system_admin',
  CONSHIP_EMPLOYEE: 'conship_employee',
  CUSTOMER: 'customer',
  CUSTOMER_USER: 'customer_user',
  FOREIGN_PARTNER: 'foreign_partner',
  FOREIGN_PARTNER_USER: 'foreign_partner_user',
  VENDOR_ADMIN: 'vendor_admin',
  VENDOR_USER: 'vendor_user'
};

module.exports = { PERMISSION_HIERARCHY, ROLES };
