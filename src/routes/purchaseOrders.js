const express = require('express');
const router = express.Router();
const PurchaseOrder = require('../models/PurchaseOrder');
const authMiddleware = require('../middleware/auth');

// Apply auth to all routes
router.use(authMiddleware);

// GET /api/purchase-orders - Get all purchase orders
router.get('/', async (req, res) => {
  try {
    const { status, stage, originCountry, search } = req.query;
    
    // Build filter based on user role
    let filter = {};
    
    // If user is not system admin or employee, filter by their company
    if (req.user.userType !== 'system_admin' && req.user.userType !== 'conship_employee') {
      filter.company = req.user.company;
    }
    
    // Apply additional filters
    if (status) filter.status = status;
    if (stage) filter.currentStage = stage;
    if (originCountry) filter.originCountry = originCountry;
    
    // Search by PO number, invoice, or confirmation number
    if (search) {
      filter.$or = [
        { poNumber: { $regex: search, $options: 'i' } },
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { orderConfirmationNumber: { $regex: search, $options: 'i' } }
      ];
    }
    
    const purchaseOrders = await PurchaseOrder.find(filter)
      .populate('createdBy', 'name email')
      .populate('company', 'name')
      .sort({ createdAt: -1 })
      .limit(100);
    
    res.json({
      success: true,
      data: purchaseOrders,
      count: purchaseOrders.length
    });
    
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching purchase orders',
      error: error.message
    });
  }
});

// GET /api/purchase-orders/recent - Get recent purchase orders
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    let filter = {};
    if (req.user.userType !== 'system_admin' && req.user.userType !== 'conship_employee') {
      filter.company = req.user.company;
    }
    
    const purchaseOrders = await PurchaseOrder.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit);
    
    res.json({
      success: true,
      data: purchaseOrders
    });
    
  } catch (error) {
    console.error('Error fetching recent purchase orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recent purchase orders',
      error: error.message
    });
  }
});

// GET /api/purchase-orders/:id - Get single purchase order
router.get('/:id', async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('company', 'name');
    
    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        message: 'Purchase order not found'
      });
    }
    
    // Check access - users can only see their company's POs
    if (req.user.userType !== 'system_admin' && 
        req.user.userType !== 'conship_employee' &&
        purchaseOrder.company?.toString() !== req.user.company?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      data: purchaseOrder
    });
    
  } catch (error) {
    console.error('Error fetching purchase order:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching purchase order',
      error: error.message
    });
  }
});

// POST /api/purchase-orders - Create new purchase order
router.post('/', async (req, res) => {
  try {
    const poData = {
      ...req.body,
      createdBy: req.user._id,
      company: req.user.company
    };
    
    // Validate required fields
    if (!poData.poNumber) {
      return res.status(400).json({
        success: false,
        message: 'PO Number is required'
      });
    }
    
    // Check for duplicate PO number
    const existing = await PurchaseOrder.findOne({ poNumber: poData.poNumber });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'PO Number already exists'
      });
    }
    
    // Initialize tracking history with order confirmed stage
    if (!poData.trackingHistory || poData.trackingHistory.length === 0) {
      poData.trackingHistory = [{
        stage: 'order_confirmed',
        status: 'completed',
        date: poData.orderDate || new Date(),
        notes: 'Order created'
      }];
    }
    
    const purchaseOrder = new PurchaseOrder(poData);
    await purchaseOrder.save();
    
    res.status(201).json({
      success: true,
      message: 'Purchase order created successfully',
      data: purchaseOrder
    });
    
  } catch (error) {
    console.error('Error creating purchase order:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating purchase order',
      error: error.message
    });
  }
});

// PUT /api/purchase-orders/:id - Update purchase order
router.put('/:id', async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id);
    
    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        message: 'Purchase order not found'
      });
    }
    
    // Check access
    if (req.user.userType !== 'system_admin' && 
        req.user.userType !== 'conship_employee' &&
        purchaseOrder.company?.toString() !== req.user.company?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Update fields
    Object.keys(req.body).forEach(key => {
      if (key !== '_id' && key !== 'createdBy' && key !== 'company') {
        purchaseOrder[key] = req.body[key];
      }
    });
    
    await purchaseOrder.save();
    
    res.json({
      success: true,
      message: 'Purchase order updated successfully',
      data: purchaseOrder
    });
    
  } catch (error) {
    console.error('Error updating purchase order:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating purchase order',
      error: error.message
    });
  }
});

// POST /api/purchase-orders/:id/tracking - Add tracking update
router.post('/:id/tracking', async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id);
    
    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        message: 'Purchase order not found'
      });
    }
    
    // Check access
    if (req.user.userType !== 'system_admin' && 
        req.user.userType !== 'conship_employee' &&
        purchaseOrder.company?.toString() !== req.user.company?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const trackingData = {
      stage: req.body.stage,
      status: req.body.status || 'completed',
      date: req.body.date || new Date(),
      trackingNumber: req.body.trackingNumber,
      carrier: req.body.carrier,
      notes: req.body.notes
    };
    
    await purchaseOrder.updateTrackingStage(trackingData);
    
    res.json({
      success: true,
      message: 'Tracking update added successfully',
      data: purchaseOrder
    });
    
  } catch (error) {
    console.error('Error adding tracking update:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding tracking update',
      error: error.message
    });
  }
});

// POST /api/purchase-orders/:id/documents - Add document
router.post('/:id/documents', async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id);
    
    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        message: 'Purchase order not found'
      });
    }
    
    // Check access
    if (req.user.userType !== 'system_admin' && 
        req.user.userType !== 'conship_employee' &&
        purchaseOrder.company?.toString() !== req.user.company?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const document = {
      type: req.body.type,
      fileName: req.body.fileName,
      fileUrl: req.body.fileUrl
    };
    
    purchaseOrder.documents.push(document);
    await purchaseOrder.save();
    
    res.json({
      success: true,
      message: 'Document added successfully',
      data: purchaseOrder
    });
    
  } catch (error) {
    console.error('Error adding document:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding document',
      error: error.message
    });
  }
});

// DELETE /api/purchase-orders/:id - Delete purchase order
router.delete('/:id', async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id);
    
    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        message: 'Purchase order not found'
      });
    }
    
    // Only system admin and employees can delete
    if (req.user.userType !== 'system_admin' && req.user.userType !== 'conship_employee') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    await purchaseOrder.deleteOne();
    
    res.json({
      success: true,
      message: 'Purchase order deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting purchase order:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting purchase order',
      error: error.message
    });
  }
});

// GET /api/purchase-orders/stats/dashboard - Get dashboard stats
router.get('/stats/dashboard', async (req, res) => {
  try {
    let filter = {};
    if (req.user.userType !== 'system_admin' && req.user.userType !== 'conship_employee') {
      filter.company = req.user.company;
    }
    
    const stats = await PurchaseOrder.aggregate([
      { $match: filter },
      {
        $facet: {
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ],
          byStage: [
            { $group: { _id: '$currentStage', count: { $sum: 1 } } }
          ],
          byOrigin: [
            { $group: { _id: '$originCountry', count: { $sum: 1 } } }
          ],
          total: [
            { $count: 'count' }
          ]
        }
      }
    ]);
    
    res.json({
      success: true,
      data: stats[0]
    });
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching stats',
      error: error.message
    });
  }
});

module.exports = router;
