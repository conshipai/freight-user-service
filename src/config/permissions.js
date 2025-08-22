const PERMISSION_HIERARCHY = {
  system_admin: {
    canManage: ['conship_employee', 'customer', 'foreign_partner'],
    defaultModules: ['quotes', 'tracking', 'analytics', 'users', 'billing', 'inventory'],
    canAssignAnyModule: true
  },
  conship_employee: {
    canManage: [],
    defaultModules: ['quotes', 'tracking', 'analytics'],
    canAssignAnyModule: false
  },
  customer: {
    canManage: ['customer_user'],
    defaultModules: ['quotes', 'tracking'],
    canCreateSubUsers: true
  },
  foreign_partner: {
    canManage: ['foreign_partner_user'],
    defaultModules: ['quotes', 'tracking'],
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
