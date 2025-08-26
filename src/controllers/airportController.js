// src/controllers/airportController.js
const mongoose = require('mongoose'); // <-- needed for direct db access
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
        active: true,
        type: 'domestic' // US airport
      }),
      Airport.findOne({ 
        code: destinationCode.toUpperCase(), 
        active: true,
        type: 'foreign' // International airport
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
    if (originAirport.country !== 'US' && originAirport.type !== 'domestic') {
      return res.status(400).json({ 
        success: false,
        error: `Origin airport ${originCode} must be a US domestic airport`,
        details: {
          airport: originCode,
          country: originAirport.country,
          type: originAirport.type
        }
      });
    }
    
    // Validate destination is international (not US)
    if (destinationAirport.country === 'US' || destinationAirport.type === 'domestic') {
      return res.status(400).json({ 
        success: false,
        error: `Destination airport ${destinationCode} must be an international airport`,
        details: {
          airport: destinationCode,
          country: destinationAirport.country,
          type: destinationAirport.type
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
        country: originAirport.country || 'US'
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
      error: 'Failed to validate airports',
      details: error.message
    });
  }
};

// Get airports by codes
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
    
    const airports = [];
    
    for (const code of airportCodes) {
      const airport = await Airport.findOne({
        code: code,
        active: true
      });
      if (airport) {
        airports.push(airport);
      }
    }
    
    // Check which codes were not found
    const foundCodes = airports.map(a => a.code);
    const notFound = airportCodes.filter(code => !foundCodes.includes(code));
    
    res.json({ 
      success: true, 
      airports,
      notFound: notFound.length > 0 ? notFound : undefined
    });
  } catch (error) {
    console.error('Error fetching airports:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch airports',
      details: error.message
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
    
    // Find the BEST airport for this ZIP (closest delivery zone - A is best)
    const zipMapping = await ZipCodeAirport.findBestAirport(zipCode);
    
    if (zipMapping) {
      // Get the full airport details from us_gateways
      const airport = await Airport.findOne({ 
        code: zipMapping.airportCode,
        active: true,
        type: 'domestic'
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

// Get all domestic airports (US only)
const getDomesticAirports = async (req, res) => {
  try {
    const { state, search } = req.query;
    
    const query = {
      type: 'domestic',
      active: true
    };
    
    if (state) {
      query.state = state.toUpperCase();
    }
    
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { code: searchRegex },
        { name: searchRegex },
        { city: searchRegex }
      ];
    }
    
    const airports = await Airport.find(query, {
      limit: 100,
      select: 'code name city state'
    });
    
    res.json({ 
      success: true, 
      count: airports.length,
      airports 
    });
  } catch (error) {
    console.error('Error fetching domestic airports:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch domestic airports',
      details: error.message
    });
  }
};

// Get all international airports (non-US)
const getInternationalAirports = async (req, res) => {
  try {
    const { country, search } = req.query;
    
    const query = {
      type: 'foreign',
      active: true
    };
    
    if (country) {
      query.country = country.toUpperCase();
    }
    
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { code: searchRegex },
        { name: searchRegex },
        { city: searchRegex }
      ];
    }
    
    const airports = await Airport.find(query, {
      limit: 100,
      select: 'code name city country'
    });
    
    res.json({ 
      success: true, 
      count: airports.length,
      airports 
    });
  } catch (error) {
    console.error('Error fetching international airports:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch international airports',
      details: error.message
    });
  }
};

// Search airports by text (for autocomplete) — UPDATED
const searchAirports = async (req, res) => {
  try {
    const { q, type } = req.query;

    console.log('Airport search:', { query: q, type }); // Debug log
    
    if (!q || q.length < 2) {
      return res.status(400).json({ 
        success: false,
        error: 'Search query must be at least 2 characters' 
      });
    }
    
    const db = mongoose.connection.db;
    
    let searchQuery;
    let airports = [];
    
    if (type === 'domestic') {
      // US airports HAVE city field
      searchQuery = {
        active: true,
        $or: [
          { code: { $regex: q.toUpperCase(), $options: 'i' } },
          { name: { $regex: q, $options: 'i' } },
          { city: { $regex: q, $options: 'i' } }  // City exists in us_gateways
        ]
      };
      
      console.log('Searching us_gateways with:', searchQuery);
      airports = await db.collection('us_gateways')
        .find(searchQuery)
        .limit(20)
        .toArray();
        
    } else if (type === 'international') {
      // Foreign airports DON'T have city field - DON'T search for it!
      searchQuery = {
        active: true,
        $or: [
          { code: { $regex: q.toUpperCase(), $options: 'i' } },
          { name: { $regex: q, $options: 'i' } },
          { country: { $regex: q, $options: 'i' } }  // Search country instead
          // REMOVED city search - it doesn't exist!
        ]
      };
      
      console.log('Searching foreign_gateways with:', searchQuery);
      airports = await db.collection('foreign_gateways')
        .find(searchQuery)
        .limit(20)
        .toArray();
    } else {
      // Search both collections if no type specified
      const [us, foreign] = await Promise.all([
        db.collection('us_gateways').find({
          active: true,
          $or: [
            { code: { $regex: q.toUpperCase(), $options: 'i' } },
            { name: { $regex: q, $options: 'i' } },
            { city: { $regex: q, $options: 'i' } }
          ]
        }).limit(10).toArray(),
        db.collection('foreign_gateways').find({
          active: true,
          $or: [
            { code: { $regex: q.toUpperCase(), $options: 'i' } },
            { name: { $regex: q, $options: 'i' } },
            { country: { $regex: q, $options: 'i' } }  // No city field here!
          ]
        }).limit(10).toArray()
      ]);
      airports = [...us, ...foreign];
    }
    
    console.log(`Found ${airports.length} airports for query: ${q}, type: ${type}`);
    
    res.json({ 
      success: true,
      airports 
    });
  } catch (error) {
    console.error('Error searching airports:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to search airports',
      details: error.message
    });
  }
};

// IMPORTANT: Export all functions
module.exports = {
  validateAirportPair,
  getAirportsByCodes,
  getNearestAirport,
  getDomesticAirports,
  getInternationalAirports,
  searchAirports
};
