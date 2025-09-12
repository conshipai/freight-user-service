// ============================================
// 3. src/routes/products.js - NEW FILE
// ============================================
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const multer = require('multer');
const csv = require('csv-parse');

// You'll need to create this model
const Product = require('../models/Product');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Get all products for the current user
router.get('/', auth, async (req, res) => {
  try {
    const products = await Product.find({
      userId: req.user._id,
      deleted: { $ne: true }
    }).sort('productName');
    
    res.json({
      success: true,
      products
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create product
router.post('/', auth, async (req, res) => {
  try {
    const product = new Product({
      ...req.body,
      userId: req.user._id,
      createdBy: req.user._id
    });
    
    await product.save();
    
    res.json({
      success: true,
      product
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update product
router.put('/:id', auth, async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user._id
      },
      {
        ...req.body,
        updatedAt: new Date()
      },
      { new: true }
    );
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      product
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete product
router.delete('/:id', auth, async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user._id
      },
      {
        deleted: true,
        deletedAt: new Date()
      }
    );
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Export products to CSV
router.get('/export', auth, async (req, res) => {
  try {
    const products = await Product.find({
      userId: req.user._id,
      deleted: { $ne: true }
    });
    
    const csvHeaders = 'Product Name,NMFC,Class,Default Weight,Default Length,Default Width,Default Height,Unit Type,Hazmat,Category,Description\n';
    
    const csvRows = products.map(p => {
      return [
        p.productName,
        p.nmfc || '',
        p.freightClass || '',
        p.defaultWeight || '',
        p.defaultLength || '',
        p.defaultWidth || '',
        p.defaultHeight || '',
        p.unitType || 'Pallets',
        p.hazmat ? 'Yes' : 'No',
        p.category || '',
        p.description || ''
      ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
    });
    
    const csvContent = csvHeaders + csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="product_catalog_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
    
  } catch (error) {
    console.error('Export products error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Import products from CSV
router.post('/import', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }
    
    const csvData = req.file.buffer.toString();
    const records = [];
    
    // Parse CSV
    const parser = csv.parse(csvData, {
      columns: true,
      skip_empty_lines: true
    });
    
    parser.on('readable', function() {
      let record;
      while (record = parser.read()) {
        records.push({
          productName: record['Product Name'],
          nmfc: record['NMFC'],
          freightClass: record['Class'],
          defaultWeight: parseFloat(record['Default Weight']) || 0,
          defaultLength: parseFloat(record['Default Length']) || 0,
          defaultWidth: parseFloat(record['Default Width']) || 0,
          defaultHeight: parseFloat(record['Default Height']) || 0,
          unitType: record['Unit Type'] || 'Pallets',
          hazmat: record['Hazmat']?.toLowerCase() === 'yes',
          category: record['Category'],
          description: record['Description'],
          userId: req.user._id,
          createdBy: req.user._id
        });
      }
    });
    
    parser.on('end', async () => {
      try {
        const products = await Product.insertMany(records);
        res.json({
          success: true,
          imported: products.length,
          message: `Successfully imported ${products.length} products`
        });
      } catch (insertError) {
        res.status(500).json({
          success: false,
          error: insertError.message
        });
      }
    });
    
    parser.on('error', (err) => {
      res.status(400).json({
        success: false,
        error: 'Invalid CSV format: ' + err.message
      });
    });
    
  } catch (error) {
    console.error('Import products error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
