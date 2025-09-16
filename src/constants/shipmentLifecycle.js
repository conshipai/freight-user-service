const ShipmentLifecycle = {
  // Quote Phase
  QUOTE_REQUESTED: 'quote_requested',
  QUOTE_PROCESSING: 'quote_processing', 
  QUOTE_READY: 'quote_ready',
  
  // Booking Phase
  BOOKING_CREATED: 'booking_created',
  BOOKING_CONFIRMED: 'booking_confirmed',
  BOOKING_CANCELLED: 'booking_cancelled',
  
  // Shipment Phase
  SHIPMENT_CREATED: 'shipment_created',
  SHIPMENT_IN_TRANSIT: 'shipment_in_transit',
  SHIPMENT_DELIVERED: 'shipment_delivered'
};

// Map old statuses to new for migration
const StatusMigrationMap = {
  'PENDING_CARRIER': 'BOOKING_CREATED',
  'CARRIER_ASSIGNED': 'BOOKING_CONFIRMED',
  'CONFIRMED': 'BOOKING_CONFIRMED',
  'IN_TRANSIT': 'SHIPMENT_IN_TRANSIT',
  'DELIVERED': 'SHIPMENT_DELIVERED',
  'CANCELLED': 'BOOKING_CANCELLED'
};

module.exports = { ShipmentLifecycle, StatusMigrationMap };
