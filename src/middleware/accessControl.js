// middleware/accessControl.js

const accessMatrix = {
  system_admin: {
    viewAllPartners: true,
    viewTrueCosts: true,
    manageAllUsers: true,
    editAllPricing: true,
    accessAllModules: true
  },
  
  conship_employee: {
    viewAllPartners: true,
    viewTrueCosts: false,
    managePartnerUsers: true,
    editPartnerPricing: true,
    accessModules: ['quotes', 'booking', 'tracking', 'reports']
  },
  
  partner_admin: {
    viewOwnPartner: true,
    viewTrueCosts: false,
    manageOwnUsers: true,
    editOwnSettings: true,
    accessModules: ['quotes', 'tracking']
  },
  
  partner_user: {
    viewOwnPartner: true,
    viewTrueCosts: false,
    manageOwnProfile: true,
    accessModules: ['quotes', 'tracking']
  },
  
  vendor_admin: {
    viewOwnVendor: true,
    manageOwnRates: true,
    manageOwnUsers: true,
    accessModules: ['rates', 'shipments']
  },
  
  vendor_user: {
    viewOwnVendor: true,
    viewAssignedShipments: true,
    accessModules: ['shipments']
  }
};

function checkAccess(user, resource, action) {
  const permissions = accessMatrix[user.role];
  // Check if user has permission for this action
  return permissions[action] || false;
}
