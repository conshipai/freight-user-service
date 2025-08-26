// src/controllers/airportController.js
const Airport = require('../models/Airport');
const ZipCodeAirport = require('../models/ZipCodeAirport');

// Validate airport codes - origin must be domestic, destination must be international
const validateAirportPair = async (req, res) => {
  try {
    const { originCode, destinationCode } = req.body;
    
    if (!originCode || !destinationCode) {
      return res.status(400).json({ 
        success: false,
        error: 'Both origin and destination airport codes are required' 
      });
    }
    
    // Fetch both airports from database
    const [originAirport, destinationAirport] = await Promise.all([
      Airport.findOne({ 
        code: originCode.toUpperCase(), 
        active: true 
      }),
      Airport.findOne({ 
        code: destinationCode.toUpperCase(), 
        active: true 
      })
    ]);
    
    // Check if airports exist
    if (!originAirport) {
      return res.status(404).json({ 
        success: false,
        error: `Origin airport ${originCode} not found in database` 
      });
    }
    
    if (!destinationAirport) {
      return res.status(404).json({ 
        success: false,
        error: `Destination airport ${destinationCode} not found in database` 
      });
    }
    
    // Validate origin is domestic (US)
    if (originAirport.country !== 'US') {
      return res.status(400).json({ 
        success: false,
        error: `Origin airport ${originCode} must be a US domestic airport`,
        details: {
          airport: originCode,
          country: originAirport.country,
          expected: 'US'
        }
      });
    }
    
    // Validate destination is international (not US)
    if (destinationAirport.country === 'US') {
      return res.status(400).json({ 
        success: false,
        error: `Destination airport ${destinationCode} must be an international airport`,
        details: {
          airport: destinationCode,
          country: destinationAirport.country,
          issue: 'Cannot be US airport'
        }
      });
    }
    
    res.json({ 
      success: true,
      valid: true,
      origin: {
        code: originAirport.code,
        name: originAirport.name,
        city: originAirport.city,
        state: originAirport.state,
        country: originAirport.country
      },
      destination: {
        code: destinationAirport.code,
        name: destinationAirport.name,
        city: destinationAirport.city,
        country: destinationAirport.country
      }
    });
  } catch (error) {
    console.error('Airport validation error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to validate airports' 
    });
  }
};

// Get airports by codes - returns full airport details
const getAirportsByCodes = async (req, res) => {
  try {
    const { codes } = req.query;
    
    if (!codes) {
      return res.status(400).json({ 
        success: false,
        error: 'Airport codes are required' 
      });
    }
    
    // Convert comma-separated codes to array
    const airportCodes = codes.split(',').map(code => code.trim().toUpperCase());
    
    const airports = await Airport.find({
      code: { $in: airportCodes },
      active: true
    }).select('-__v'); // Exclude version key
    
    // Create a map for easy lookup
    const airportMap = {};
    airports.forEach(airport => {
      airportMap[airport.code] = airport;
    });
    
    // Check which codes were not found
    const notFound = airportCodes.filter(code => !airportMap[code]);
    
    res.json({ 
      success: true, 
      airports,
      notFound: notFound.length > 0 ? notFound : undefined
    });
  } catch (error) {
    console.error('Error fetching airports:', error);
    res.status(500).json({ 
      success: false,
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
        success: false,
        error: 'Valid 5-digit ZIP code is required' 
      });
    }
    
    // First check if we have this ZIP in our mapping table
    const zipMapping = await ZipCodeAirport.findOne({
      zipCode: zipCode,
      isActive: true
    }).sort('distance');
    
    if (zipMapping) {
      // Get the full airport details from your main airports collection
      const airport = await Airport.findOne({ 
        code: zipMapping.airportCode,
        active: true,
        country: 'US' // Ensure it's a domestic airport
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
    
    // If no mapping found, return error
    // You can implement fallback logic here if needed
    res.status(404).json({
      success: false,
      error: `No airport mapping found for ZIP code ${zipCode}`,
      message: 'Please enter the origin airport code manually'
    });
  } catch (error) {
    console.error('Error finding nearest airport:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to find nearest airport' 
    });
  }
};

// Get all domestic airports (US only)
const getDomesticAirports = async (req, res) => {
  try {
    const { state, search } = req.query;
    
    const query = {
      country: 'US',
      active: true
    };
    
    if (state) {
      query.state = state.toUpperCase();
    }
    
    if (search) {
      query.$or = [
        { code: new RegExp(search, 'i') },
        { name: new RegExp(search, 'i') },
        { city: new RegExp(search, 'i') }
      ];
    }
    
    const airports = await Airport.find(query)
      .select('code name city state')
      .sort('code')
      .limit(100); // Limit results for performance
    
    res.json({ 
      success: true, 
      count: airports.length,
      airports 
    });
  } catch (error) {
    console.error('Error fetching domestic airports:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch domestic airports' 
    });
  }
};

// Get all international airports (non-US)
const getInternationalAirports = async (req, res) => {
  try {
    const { country, search } = req.query;
    
    const query = {
      country: { $ne: 'US' }, // Not US
      active: true
    };
    
    if (country) {
      query.country = country.toUpperCase();
    }
    
    if (search) {
      query.$or = [
        { code: new RegExp(search, 'i') },
        { name: new RegExp(search, 'i') },
        { city: new RegExp(search, 'i') }
      ];
    }
    
    const airports = await Airport.find(query)
      .select('code name city country')
      .sort('country code')
      .limit(100); // Limit results for performance
    
    res.json({ 
      success: true, 
      count: airports.length,
      airports 
    });
  } catch (error) {
    console.error('Error fetching international airports:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch international airports' 
    });
  }
};

// Search airports by text (for autocomplete)
const searchAirports = async (req, res) => {
  try {
    const { q, type } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(400).json({ 
        success: false,
        error: 'Search query must be at least 2 characters' 
      });
    }
    
    const query = {
      active: true,
      $or: [
        { code: new RegExp(q, 'i') },
        { name: new RegExp(q, 'i') },
        { city: new RegExp(q, 'i') }
      ]
    };
    
    // Filter by type (domestic or international)
    if (type === 'domestic') {
      query.country = 'US';
    } else if (type === 'international') {
      query.country = { $ne: 'US' };
    }
    
    const airports = await Airport.find(query)
      .select('code name city state country')
      .limit(20)
      .sort({ code: 1 });
    
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

module.exports = {
  validateAirportPair,
  getAirportsByCodes,
  getNearestAirport,
  getDomesticAirports,
  getInternationalAirports,
  searchAirports
};
