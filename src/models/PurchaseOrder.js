const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  itemNumber: String,
  partNumber: { type: String, required: true },
  description: { type: String, required: true },
  quantity: { type: Number, required: true },
  weight: Number, // in kg
  dimensions: {
    length: Number,
    width: Number,
    height: Number,
    unit: { type: String, default: 'cm' }
  },
  hsCode: String,
  value: Number
});

const addressSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  contactPerson: String,
  contactPhone: String,
  address1: String,
  address2: String,
  city: String,
  state: String,
  zipCode: String,
  country: String
});

const trackingStageSchema = new mongoose.Schema({
  stage: {
    type: String,
    enum: [
      'order_confirmed',
      'shipped_from_origin',
      'in_transit_to_us',
      'customs_clearance',
      'final_delivery_in_progress',
      'delivered'
    ],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed'],
    default: 'pending'
  },
  date: Date,
  trackingNumber: String,
  carrier: String,
  notes: String,
  updatedAt: { type: Date, default: Date.now }
});

const purchaseOrderSchema = new mongoose.Schema({
  // Reference Numbers
  poNumber: { type: String, required: true, unique: true },
  orderConfirmationNumber: String,
  invoiceNumber: String,
  projectNumber: String,
  mrnNumber: String, // Customs reference
  
  // Origin
  originCountry: {
    type: String,
    enum: ['Germany', 'USA'],
    required: true
  },
  shipper: addressSchema,
  
  // Destination
  buyer: { type: addressSchema, required: true },
  deliveryAddress: addressSchema, // Can be different from buyer
  
  // Shipment Details
  incoterms: String, // CIP, EXW, etc.
  initialShipmentMethod: {
    type: String,
    enum: ['Air Freight', 'DHL Parcel', 'Ocean Freight', 'Ground'],
    required: true
  },
  finalDeliveryMethod: {
    type: String,
    enum: ['UPS', 'FedEx', 'LTL', 'Customer Arranged', 'Not Applicable']
  },
  
  // Line Items
  items: [lineItemSchema],
  
  // Weights and Dimensions
  totalGrossWeight: Number, // kg
  totalNetWeight: Number, // kg
  packageCount: Number,
  packageDetails: String,
  
  // Dates
  orderDate: { type: Date, required: true },
  shippedDate: Date,
  estimatedDeliveryDate: Date,
  actualDeliveryDate: Date,
  
  // Tracking
  currentStage: {
    type: String,
    enum: [
      'order_confirmed',
      'shipped_from_origin',
      'in_transit_to_us',
      'customs_clearance',
      'final_delivery_in_progress',
      'delivered'
    ],
    default: 'order_confirmed'
  },
  trackingHistory: [trackingStageSchema],
  
  // Status
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active'
  },
  
  // Financial
  totalValue: Number,
  currency: { type: String, default: 'USD' },
  
  // Documents (S3 keys or URLs)
  documents: [{
    type: {
      type: String,
      enum: ['order_confirmation', 'commercial_invoice', 'packing_list', 'customs_docs', 'delivery_receipt', 'other']
    },
    fileName: String,
    fileUrl: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Notes
  specialInstructions: String,
  internalNotes: String,
  
  // Metadata
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  
}, {
  timestamps: true
});

// Indexes for common queries
purchaseOrderSchema.index({ poNumber: 1 });
purchaseOrderSchema.index({ orderConfirmationNumber: 1 });
purchaseOrderSchema.index({ invoiceNumber: 1 });
purchaseOrderSchema.index({ status: 1 });
purchaseOrderSchema.index({ currentStage: 1 });
purchaseOrderSchema.index({ company: 1 });
purchaseOrderSchema.index({ createdAt: -1 });

// Virtual for checking if international shipment
purchaseOrderSchema.virtual('isInternational').get(function() {
  return this.originCountry === 'Germany';
});

// Method to update tracking stage
purchaseOrderSchema.methods.updateTrackingStage = function(stageData) {
  this.trackingHistory.push(stageData);
  this.currentStage = stageData.stage;
  
  // Auto-complete status when delivered
  if (stageData.stage === 'delivered') {
    this.status = 'completed';
    this.actualDeliveryDate = stageData.date || new Date();
  }
  
  return this.save();
};

const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);

module.exports = PurchaseOrder;
