// src/services/bolService.js
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const BOL = require('../models/BOL');
const Booking = require('../models/Booking');

class BOLService {
  constructor() {
    // Create uploads directory if it doesn't exist
    this.uploadsDir = path.join(__dirname, '../../uploads/bols');
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async generateBOL(bookingId, userId) {
    try {
      // 1. Get booking data
      const booking = await Booking.findOne({ bookingId }).lean();
      if (!booking) {
        throw new Error('Booking not found');
      }

      // 2. Generate BOL number
      const bolNumber = this.generateBOLNumber();
      
      // 3. Create PDF
      const pdfPath = await this.createPDF(booking, bolNumber);
      
      // 4. Save BOL record to database
      const bol = new BOL({
        bookingId: booking._id,
        requestId: booking.requestId,
        bolNumber,
        fileUrl: `/api/bols/pdf/${path.basename(pdfPath)}`,
        fileKey: path.basename(pdfPath),
        status: 'final',
        metadata: {
          shipper: {
            name: booking.shipmentData?.formData?.originCompany || 'ConShip Customer',
            address: booking.shipmentData?.formData?.originAddress || '',
            city: booking.shipmentData?.formData?.originCity || '',
            state: booking.shipmentData?.formData?.originState || '',
            zip: booking.shipmentData?.formData?.originZip || '',
            contact: booking.shipmentData?.formData?.originContact || '',
            phone: booking.shipmentData?.formData?.originPhone || ''
          },
          consignee: {
            name: booking.shipmentData?.formData?.destCompany || '',
            address: booking.shipmentData?.formData?.destAddress || '',
            city: booking.shipmentData?.formData?.destCity || '',
            state: booking.shipmentData?.formData?.destState || '',
            zip: booking.shipmentData?.formData?.destZip || '',
            contact: booking.shipmentData?.formData?.destContact || '',
            phone: booking.shipmentData?.formData?.destPhone || ''
          },
          carrier: {
            name: booking.carrier || '',
            proNumber: booking.pickupNumber || ''
          },
          commodities: this.formatCommodities(booking),
          specialInstructions: booking.shipmentData?.formData?.specialInstructions || ''
        },
        createdBy: userId
      });
      
      await bol.save();
      
      return {
        success: true,
        bolNumber,
        fileUrl: bol.fileUrl,
        bolId: bol._id
      };
      
    } catch (error) {
      console.error('BOL generation error:', error);
      throw error;
    }
  }

  generateBOLNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `BOL-${year}${month}${day}-${random}`;
  }

  formatCommodities(booking) {
    const commodities = booking.shipmentData?.formData?.commodities || [];
    return commodities.map(item => ({
      quantity: item.quantity || 1,
      unitType: item.unitType || 'Pallets',
      weight: item.weight || 0,
      class: item.calculatedClass || item.overrideClass || '50',
      description: item.description || 'General Freight',
      nmfc: item.nmfc || '',
      hazmat: item.hazmat || false
    }));
  }

  async createPDF(booking, bolNumber) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
      const filename = `BOL-${bolNumber}-${uuidv4()}.pdf`;
      const filepath = path.join(this.uploadsDir, filename);
      
      // Stream to file
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);
      
      // Header
      doc.fontSize(20).text('BILL OF LADING', { align: 'center' });
      doc.moveDown();
      
      // BOL Number and Date
      doc.fontSize(10);
      doc.text(`BOL Number: ${bolNumber}`, { align: 'left' });
      doc.text(`Date: ${new Date().toLocaleDateString()}`, { align: 'left' });
      doc.text(`Booking ID: ${booking.bookingId}`, { align: 'left' });
      doc.moveDown();
      
      // Divider line
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown();
      
      // Shipper and Consignee sections
      const startY = doc.y;
      
      // Shipper (left column)
      doc.fontSize(12).text('SHIPPER:', 50, startY, { underline: true });
      doc.fontSize(10);
      const shipperData = booking.shipmentData?.formData || {};
      doc.text(shipperData.originCompany || 'ConShip Customer', 50, doc.y);
      doc.text(shipperData.originAddress || '', 50, doc.y);
      doc.text(`${shipperData.originCity || ''}, ${shipperData.originState || ''} ${shipperData.originZip || ''}`, 50, doc.y);
      doc.text(`Phone: ${shipperData.originPhone || 'N/A'}`, 50, doc.y);
      
      // Consignee (right column)
      doc.fontSize(12).text('CONSIGNEE:', 300, startY, { underline: true });
      doc.fontSize(10);
      doc.text(shipperData.destCompany || '', 300, startY + 20);
      doc.text(shipperData.destAddress || '', 300, startY + 35);
      doc.text(`${shipperData.destCity || ''}, ${shipperData.destState || ''} ${shipperData.destZip || ''}`, 300, startY + 50);
      doc.text(`Phone: ${shipperData.destPhone || 'N/A'}`, 300, startY + 65);
      
      // Move down past both columns
      doc.y = Math.max(doc.y, startY + 100);
      doc.moveDown();
      
      // Carrier Information
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown();
      doc.fontSize(12).text('CARRIER INFORMATION:', { underline: true });
      doc.fontSize(10);
      doc.text(`Carrier: ${booking.carrier || 'TBD'}`);
      doc.text(`PRO/Tracking #: ${booking.pickupNumber || 'TBD'}`);
      doc.text(`Pickup Date: ${new Date(shipperData.pickupDate || Date.now()).toLocaleDateString()}`);
      doc.moveDown();
      
      // Commodities Table
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown();
      doc.fontSize(12).text('COMMODITIES:', { underline: true });
      doc.moveDown();
      
      // Table headers
      doc.fontSize(9);
      const tableTop = doc.y;
      doc.text('QTY', 50, tableTop);
      doc.text('TYPE', 90, tableTop);
      doc.text('WEIGHT', 150, tableTop);
      doc.text('CLASS', 210, tableTop);
      doc.text('DESCRIPTION', 260, tableTop);
      
      // Table rows
      const commodities = shipperData.commodities || [];
      let yPosition = tableTop + 20;
      
      commodities.forEach(item => {
        doc.text(item.quantity || '1', 50, yPosition);
        doc.text(item.unitType || 'Pallets', 90, yPosition);
        doc.text(`${item.weight || '0'} lbs`, 150, yPosition);
        doc.text(item.calculatedClass || '50', 210, yPosition);
        doc.text(item.description || 'General Freight', 260, yPosition);
        yPosition += 20;
      });
      
      // Totals
      doc.y = yPosition + 10;
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown();
      
      const totalPieces = commodities.reduce((sum, item) => sum + parseInt(item.quantity || 0), 0);
      const totalWeight = commodities.reduce((sum, item) => sum + parseInt(item.weight || 0), 0);
      
      doc.fontSize(10);
      doc.text(`Total Pieces: ${totalPieces}`, 50, doc.y);
      doc.text(`Total Weight: ${totalWeight} lbs`, 200, doc.y - 15);
      doc.moveDown();
      
      // Special Instructions
      if (shipperData.specialInstructions) {
        doc.moveDown();
        doc.fontSize(12).text('SPECIAL INSTRUCTIONS:', { underline: true });
        doc.fontSize(10).text(shipperData.specialInstructions);
      }
      
      // Footer - Signature sections
      doc.y = 650; // Fixed position for signatures
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown();
      
      doc.fontSize(10);
      doc.text('SHIPPER SIGNATURE:', 50, doc.y);
      doc.text('_______________________', 50, doc.y + 15);
      doc.text('Date: _________________', 50, doc.y + 30);
      
      doc.text('CARRIER SIGNATURE:', 300, doc.y - 30);
      doc.text('_______________________', 300, doc.y - 15);
      doc.text('Date: _________________', 300, doc.y);
      
      // Finalize PDF
      doc.end();
      
      stream.on('finish', () => {
        resolve(filepath);
      });
      
      stream.on('error', reject);
    });
  }

  async getBOLByBookingId(bookingId) {
    return await BOL.findOne({ bookingId }).lean();
  }

  async getBOLById(bolId) {
    return await BOL.findById(bolId).lean();
  }
}

module.exports = new BOLService();
