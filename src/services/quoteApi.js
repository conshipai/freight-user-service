// src/services/quoteApi.js
import API_BASE from '../config/api';

class QuoteAPI {
  // Create GROUND quote request - UPDATED
  async createGroundQuoteRequest(formData, serviceType) {
    try {
      console.log('📤 Sending to backend:', { serviceType, formData });
      
      const response = await fetch(`${API_BASE}/ground-quotes/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`
        },
        body: JSON.stringify({
          serviceType,
          formData
        })
      });

      const data = await response.json();
      console.log('📥 Backend response:', data);

      if (!data.success) {
        throw new Error(data.error || 'Failed to create quote');
      }

      return {
        success: true,
        requestId: data.data._id,
        requestNumber: data.data.requestNumber
      };
    } catch (error) {
      console.error('❌ API error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get ground quote results - NEW
  async getGroundQuoteResults(requestId) {
    try {
      const response = await fetch(`${API_BASE}/ground-quotes/results/${requestId}`, {
        headers: {
          'Authorization': `Bearer ${this.getToken()}`
        }
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('❌ Get results error:', error);
      return { success: false, error: error.message };
    }
  }

  // Keep mock methods as fallback...
  async mockCreateQuoteRequest(formData, serviceType) {
    // Keep existing mock code
  }

  async mockGetGroundQuoteResults(requestId) {
    // Keep existing mock code
  }

  getToken() {
    return localStorage.getItem('auth_token') || '';
  }
}

export default new QuoteAPI();
