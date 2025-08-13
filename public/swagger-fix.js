/**
 * API key enhancement for Swagger UI
 * 
 * This script ensures API keys entered in the Authorize dialog
 * are correctly applied to all requests.
 */
window.addEventListener('load', function() {
  setTimeout(function() {
    const ui = window.ui;
    if (!ui || !ui.getConfigs) return;
    
    // Create request interceptor
    const configs = ui.getConfigs();
    const originalInterceptor = configs.requestInterceptor || (req => req);
    
    configs.requestInterceptor = function(request) {
      request = originalInterceptor(request);
      
      // Get stored API key
      const auth = localStorage.getItem('swagger_ui_api_key');
      if (auth) {
        try {
          const apiKey = JSON.parse(auth);
          if (!request.headers) request.headers = {};
          request.headers['Authorization'] = `Bearer ${apiKey}`;
        } catch (e) {}
      }
      return request;
    };
    
    // Store API key when user authorizes
    const originalAuthorize = ui.authActions.authorize;
    ui.authActions.authorize = function(data) {
      localStorage.setItem('swagger_ui_api_key', 
        JSON.stringify(Object.values(data)[0].value));
      return originalAuthorize(data);
    };
    
    // Clear API key when logging out
    const originalLogout = ui.authActions.logout;
    ui.authActions.logout = function(data) {
      localStorage.removeItem('swagger_ui_api_key');
      return originalLogout(data);
    };
  }, 1000);
}); 