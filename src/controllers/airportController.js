// src/controllers/airportController.js
const Airport = require('../models/Airport');
const ZipCodeAirport = require('../models/ZipCodeAirport');

// Get airports by codes
const getAirportsByCodes = async (req, res) => {
  try {
    const { codes } = req.query;
    
    if (!codes) {
      return res.status(400).json({ 
        error: 'Airport codes are required' 
      });
    }
    
    // Convert comma-separated codes to array
    const airportCodes = codes.split(',').map(code => code.trim().toUpperCase());
    
    const airports = await Airport.find({
      code: { $in: airportCodes },
      active: true
    });
    
    res.json({ 
      success: true, 
      airports 
    });
  } catch (error) {
    console.error('Error fetching airports:', error);
    res.status(500).json({ 
      error: 'Failed to fetch airports' 
    });
  }
};

// Get nearest airport for a ZIP code
const getNearestAirport = async (req, res) => {
  try {
    const { zipCode } = req.body;
    
    if (!zipCode || zipCode.length !== 5) {
      return res.status(400).json({ 
        error: 'Valid 5-digit ZIP code is required' 
      });
    }
    
    // First check if we have this ZIP in our mapping
    const zipMapping = await ZipCodeAirport.findOne({
      zipCode: zipCode,
      isActive: true
    }).sort('distance');
    
    if (zipMapping) {
      // Get the full airport details
      const airport = await Airport.findOne({ 
        code: zipMapping.airportCode,
        active: true 
      });
      
      if (airport) {
        return res.json({
          success: true,
          airport: {
            code: airport.code,
            name: airport.name,
            city: airport.city,
            state: airport.state,
            country: airport.country,
            distance: zipMapping.distance
          }
        });
      }
    }
    
    // Fallback to default airports based on state
    const state = req.body.state;
    const defaultAirports = {
      'CA': 'LAX',
      'NY': 'JFK',
      'IL': 'ORD',
      'TX': 'DFW',
      'FL': 'MIA',
      'GA': 'ATL',
      'WA': 'SEA',
      'MA': 'BOS',
      'PA': 'PHL',
      'AZ': 'PHX'
    };
    
    const defaultCode = defaultAirports[state] || 'JFK';
    const defaultAirport = await Airport.findOne({ 
      code: defaultCode,
      active: true 
    });
    
    res.json({
      success: true,
      airport: defaultAirport || {
        code: defaultCode,
        name: 'Default Airport',
        city: 'Unknown',
        state: state || 'NY',
        country: 'US'
      }
    });
  } catch (error) {
    console.error('Error finding nearest airport:', error);
    res.status(500).json({ 
      error: 'Failed to find nearest airport' 
    });
  }
};

// Get all domestic airports
const getDomesticAirports = async (req, res) => {
  try {
    const airports = await Airport.find({
      country: 'US',
      active: true,
      type: { $in: ['domestic', 'both'] }
    }).sort('code');
    
    res.json({ 
      success: true, 
      airports 
    });
  } catch (error) {
    console.error('Error fetching domestic airports:', error);
    res.status(500).json({ 
      error: 'Failed to fetch domestic airports' 
    });
  }
};

// Get all international airports
const getInternationalAirports = async (req, res) => {
  try {
    const { country } = req.query;
    
    const query = {
      active: true,
      type: { $in: ['international', 'both'] }
    };
    
    if (country) {
      query.country = country.toUpperCase();
    } else {
      // Exclude US airports for international list
      query.country = { $ne: 'US' };
    }
    
    const airports = await Airport.find(query).sort('country code');
    
    res.json({ 
      success: true, 
      airports 
    });
  } catch (error) {
    console.error('Error fetching international airports:', error);
    res.status(500).json({ 
      error: 'Failed to fetch international airports' 
    });
  }
};

module.exports = {
  getAirportsByCodes,
  getNearestAirport,
  getDomesticAirports,
  getInternationalAirports
};
