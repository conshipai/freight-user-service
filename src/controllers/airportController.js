// At the top of the file, make sure you have:
const Airport = require('../models/Airport');
const ZipCodeAirport = require('../models/ZipCodeAirport');

// Updated getNearestAirport function:
const getNearestAirport = async (req, res) => {
  try {
    const { zipCode } = req.body;
    
    if (!zipCode || zipCode.length !== 5) {
      return res.status(400).json({ 
        success: false,
        error: 'Valid 5-digit ZIP code is required' 
      });
    }
    
    // Find the BEST airport for this ZIP (closest delivery zone - A is best)
    const zipMapping = await ZipCodeAirport.findBestAirport(zipCode);
    
    if (zipMapping) {
      // Get the full airport details from us_gateways
      const airport = await Airport.findOne({ 
        code: zipMapping.airportCode,
        active: true,
        type: 'domestic' // Make sure it's domestic
      });
      
      if (airport) {
        return res.json({
          success: true,
          airport: {
            code: airport.code,
            name: airport.name,
            city: airport.city || zipMapping.city,
            state: airport.state || zipMapping.state,
            country: 'US',
            deliveryZone: zipMapping.deliveryZone
          }
        });
      }
    }
    
    // If no mapping found, return error
    res.status(404).json({
      success: false,
      error: `No airport mapping found for ZIP code ${zipCode}`,
      message: 'Please enter the origin airport code manually'
    });
  } catch (error) {
    console.error('Error finding nearest airport:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to find nearest airport',
      details: error.message 
    });
  }
};

// Updated searchAirports function:
const searchAirports = async (req, res) => {
  try {
    const { q, type } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(400).json({ 
        success: false,
        error: 'Search query must be at least 2 characters' 
      });
    }
    
    const searchRegex = new RegExp(q, 'i');
    const query = {
      active: true,
      $or: [
        { code: searchRegex },
        { name: searchRegex },
        { city: searchRegex }
      ]
    };
    
    // Add type filter
    if (type === 'domestic') {
      query.type = 'domestic';
    } else if (type === 'international') {
      query.type = 'foreign';
    }
    
    const airports = await Airport.find(query, {
      limit: 20,
      select: 'code name city state country'
    });
    
    res.json({ 
      success: true,
      airports 
    });
  } catch (error) {
    console.error('Error searching airports:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to search airports' 
    });
  }
};
