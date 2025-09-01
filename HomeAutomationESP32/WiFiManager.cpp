/*
 * Modern WiFi Manager Implementation
 * Author: ESP32 Home Automation Team
 */

#include "WiFiManager.h"

ModernWiFiManager::ModernWiFiManager() : server(80) {}

void ModernWiFiManager::begin() {
    Serial.println("Initializing Modern WiFi Manager...");
    
    // Try to connect to saved WiFi first
    if (connectToWiFi()) {
        Serial.println("Connected to saved WiFi network");
        return;
    }
    
    // If no saved WiFi or connection failed, start config mode
    Serial.println("Starting WiFi configuration mode...");
    startConfigMode();
}

bool ModernWiFiManager::connectToWiFi() {
    String ssid, password;
    
    if (!loadWiFiCredentials(ssid, password)) {
        Serial.println("No WiFi credentials found");
        return false;
    }
    
    Serial.println("Attempting to connect to: " + ssid);
    WiFi.begin(ssid.c_str(), password.c_str());
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi connected successfully!");
        Serial.println("IP address: " + WiFi.localIP().toString());
        return true;
    } else {
        Serial.println("\nFailed to connect to WiFi");
        return false;
    }
}

void ModernWiFiManager::startConfigMode() {
    isConfigMode = true;
    configModeStartTime = millis();
    
    // Stop any existing WiFi connection
    WiFi.disconnect();
    delay(100);
    
    // Configure AP
    WiFi.mode(WIFI_AP);
    WiFi.softAPConfig(AP_IP, AP_GATEWAY, AP_SUBNET);
    WiFi.softAP(AP_SSID, AP_PASSWORD);
    
    Serial.println("Access Point started");
    Serial.println("SSID: " + String(AP_SSID));
    Serial.println("IP: " + AP_IP.toString());
    
    // Start DNS server for captive portal
    dnsServer.start(53, "*", AP_IP);
    
    // Setup web server routes
    server.on("/", [this]() { handleRoot(); });
    server.on("/scan", [this]() { handleWiFiScan(); });
    server.on("/status", [this]() { 
        server.sendHeader("Access-Control-Allow-Origin", "*");
        server.send(200, "application/json", "{\"status\":\"ready\",\"mode\":\"config\"}"); 
    });
    server.on("/debug", [this]() { 
        String debug = "WiFi Mode: " + String(WiFi.getMode()) + "\\n";
        debug += "AP Status: " + String(WiFi.softAPgetStationNum()) + " clients\\n";
        debug += "Free Heap: " + String(ESP.getFreeHeap()) + "\\n";
        server.send(200, "text/plain", debug);
    });
    server.on("/connect", HTTP_POST, [this]() { handleWiFiConnect(); });
    server.onNotFound([this]() { handleNotFound(); });
    
    server.begin();
    Serial.println("Web server started");
}

void ModernWiFiManager::handleRoot() {
    server.send(200, "text/html", getModernHTML());
}

void ModernWiFiManager::handleWiFiScan() {
    Serial.println("WiFi scan requested");
    
    // Add CORS headers for better compatibility
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    
    try {
        String scanResults = getWiFiScanResults();
        server.send(200, "application/json", scanResults);
    } catch (...) {
        Serial.println("Error during WiFi scan");
        server.send(500, "application/json", "{\"networks\":[],\"error\":\"Scan failed\"}");
    }
}

void ModernWiFiManager::handleWiFiConnect() {
    if (!server.hasArg("ssid") || !server.hasArg("password")) {
        server.send(400, "application/json", "{\"success\":false,\"message\":\"Missing SSID or password\"}");
        return;
    }
    
    String ssid = server.arg("ssid");
    String password = server.arg("password");
    
    Serial.println("Attempting to connect to: " + ssid);
    
    // Test connection
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    delay(500);
    
    WiFi.begin(ssid.c_str(), password.c_str());
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) { // Increased attempts
        delay(500);
        Serial.print(".");
        attempts++;
        
        // Check for specific error conditions
        if (WiFi.status() == WL_CONNECT_FAILED) {
            Serial.println("\nConnection failed - wrong password?");
            break;
        }
        if (WiFi.status() == WL_NO_SSID_AVAIL) {
            Serial.println("\nSSID not available");
            break;
        }
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi connected successfully!");
        Serial.println("IP address: " + WiFi.localIP().toString());
        
        // Save credentials
        saveWiFiCredentials(ssid, password);
        server.send(200, "application/json", "{\"success\":true,\"message\":\"Connected successfully! Device will restart.\"}");
        
        delay(2000);
        ESP.restart();
    } else {
        Serial.println("\nFailed to connect. Status: " + String(WiFi.status()));
        
        // Return to AP mode
        WiFi.mode(WIFI_AP);
        delay(100);
        WiFi.softAPConfig(AP_IP, AP_GATEWAY, AP_SUBNET);
        WiFi.softAP(AP_SSID, AP_PASSWORD);
        
        // Restart DNS server
        dnsServer.start(53, "*", AP_IP);
        
        String errorMsg = "Failed to connect. ";
        switch (WiFi.status()) {
            case WL_CONNECT_FAILED:
                errorMsg += "Wrong password?";
                break;
            case WL_NO_SSID_AVAIL:
                errorMsg += "Network not found.";
                break;
            case WL_CONNECTION_LOST:
                errorMsg += "Connection lost.";
                break;
            default:
                errorMsg += "Please check credentials.";
                break;
        }
        
        server.send(200, "application/json", "{\"success\":false,\"message\":\"" + errorMsg + "\"}");
    }
}

void ModernWiFiManager::handleNotFound() {
    // Redirect all unknown requests to root for captive portal
    server.sendHeader("Location", "/", true);
    server.send(302, "text/plain", "");
}

void ModernWiFiManager::handleClient() {
    if (isConfigMode) {
        dnsServer.processNextRequest();
        server.handleClient();
        
        // Auto-exit config mode after timeout
        if (millis() - configModeStartTime > CONFIG_MODE_TIMEOUT) {
            Serial.println("Config mode timeout. Restarting...");
            ESP.restart();
        }
    }
}

bool ModernWiFiManager::isInConfigMode() {
    return isConfigMode;
}

void ModernWiFiManager::resetWiFiSettings() {
    clearWiFiCredentials();
    Serial.println("WiFi settings cleared. Restarting...");
    delay(1000);
    ESP.restart();
}

void ModernWiFiManager::saveWiFiCredentials(const String& ssid, const String& password) {
    // Clear the memory areas first
    for (int i = 0; i < MAX_SSID_LENGTH; i++) {
        EEPROM.write(WIFI_SSID_ADDR + i, 0);
    }
    for (int i = 0; i < MAX_PASS_LENGTH; i++) {
        EEPROM.write(WIFI_PASS_ADDR + i, 0);
    }
    
    // Write SSID
    for (int i = 0; i < ssid.length() && i < MAX_SSID_LENGTH - 1; i++) {
        EEPROM.write(WIFI_SSID_ADDR + i, ssid[i]);
    }
    
    // Write password
    for (int i = 0; i < password.length() && i < MAX_PASS_LENGTH - 1; i++) {
        EEPROM.write(WIFI_PASS_ADDR + i, password[i]);
    }
    
    // Mark as configured
    EEPROM.write(WIFI_CONFIGURED_ADDR, 1);
    EEPROM.commit();
    
    Serial.println("WiFi credentials saved");
}

bool ModernWiFiManager::loadWiFiCredentials(String& ssid, String& password) {
    if (EEPROM.read(WIFI_CONFIGURED_ADDR) != 1) {
        return false;
    }
    
    char ssidBuf[MAX_SSID_LENGTH];
    char passBuf[MAX_PASS_LENGTH];
    
    // Read SSID
    for (int i = 0; i < MAX_SSID_LENGTH; i++) {
        ssidBuf[i] = EEPROM.read(WIFI_SSID_ADDR + i);
    }
    ssidBuf[MAX_SSID_LENGTH - 1] = '\0';
    
    // Read password
    for (int i = 0; i < MAX_PASS_LENGTH; i++) {
        passBuf[i] = EEPROM.read(WIFI_PASS_ADDR + i);
    }
    passBuf[MAX_PASS_LENGTH - 1] = '\0';
    
    ssid = String(ssidBuf);
    password = String(passBuf);
    
    return ssid.length() > 0;
}

void ModernWiFiManager::clearWiFiCredentials() {
    EEPROM.write(WIFI_CONFIGURED_ADDR, 0);
    EEPROM.commit();
}

bool ModernWiFiManager::isWiFiConfigured() {
    return EEPROM.read(WIFI_CONFIGURED_ADDR) == 1;
}

String ModernWiFiManager::getWiFiScanResults() {
    Serial.println("Starting WiFi scan...");
    
    // Save current WiFi mode
    wifi_mode_t currentMode = WiFi.getMode();
    
    // Switch to AP+STA mode to allow scanning while keeping AP running
    WiFi.mode(WIFI_AP_STA);
    delay(100);
    
    // Perform scan
    int n = WiFi.scanNetworks(false, true); // async=false, show_hidden=true
    
    Serial.println("Scan completed. Networks found: " + String(n));
    
    String json = "{\"networks\":[";
    
    if (n > 0) {
        for (int i = 0; i < n; i++) {
            if (i > 0) json += ",";
            json += "{";
            json += "\"ssid\":\"" + WiFi.SSID(i) + "\",";
            json += "\"rssi\":" + String(WiFi.RSSI(i)) + ",";
            json += "\"security\":\"" + String(WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "Open" : "Secured") + "\"";
            json += "}";
        }
    }
    
    json += "]}";
    
    // Clear scan results to free memory
    WiFi.scanDelete();
    
    // Restore AP mode
    WiFi.mode(WIFI_AP);
    delay(100);
    
    // Reconfigure AP in case it was disrupted
    WiFi.softAPConfig(AP_IP, AP_GATEWAY, AP_SUBNET);
    WiFi.softAP(AP_SSID, AP_PASSWORD);
    
    Serial.println("WiFi scan results: " + json);
    return json;
}

String ModernWiFiManager::getModernHTML() {
    String html = "<!DOCTYPE html>"
    "<html lang=\"en\">"
    "<head>"
    "<meta charset=\"UTF-8\">"
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">"
    "<title>Smart Home Setup</title>"
    "<style>"
    "* { margin: 0; padding: 0; box-sizing: border-box; }"
    "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #333; }"
    ".container { background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px); border-radius: 24px; padding: 2.5rem; box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15); max-width: 420px; width: 90%; animation: slideUp 0.6s ease-out; }"
    "@keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }"
    ".header { text-align: center; margin-bottom: 2rem; }"
    ".welcome-icon { font-size: 3rem; margin-bottom: 1rem; display: block; }"
    ".title { font-size: 1.8rem; font-weight: 700; color: #2d3748; margin-bottom: 0.5rem; }"
    ".subtitle { color: #718096; font-size: 1rem; line-height: 1.5; }"
    ".section { margin-bottom: 1.5rem; }"
    ".section-title { font-size: 1.1rem; font-weight: 600; color: #4a5568; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }"
    ".networks-list { max-height: 60vh; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 12px; background: #f7fafc; }"
    ".network-item { padding: 0.75rem 1rem; border-bottom: 1px solid #e2e8f0; cursor: pointer; transition: all 0.2s ease; display: flex; justify-content: space-between; align-items: center; }"
    ".network-item:last-child { border-bottom: none; }"
    ".network-item:hover { background: #edf2f7; }"
    ".network-item.selected { background: #667eea; color: white; }"
    ".network-name { font-weight: 500; flex: 1; }"
    ".network-signal { font-size: 1rem; opacity: 0.8; font-family: monospace; color: #4a5568; }"
    ".network-security { font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 6px; background: rgba(0,0,0,0.1); margin-left: 0.5rem; }"
    ".form-group { margin-bottom: 1rem; }"
    ".form-label { display: block; font-weight: 500; color: #4a5568; margin-bottom: 0.5rem; }"
    ".form-input { width: 100%; padding: 0.75rem 1rem; border: 2px solid #e2e8f0; border-radius: 12px; font-size: 1rem; transition: all 0.2s ease; background: white; }"
    ".form-input:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1); }"
    ".btn { width: 100%; padding: 0.875rem 1.5rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 12px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.2s ease; margin-bottom: 0.5rem; }"
    ".btn:hover { transform: translateY(-1px); box-shadow: 0 10px 25px rgba(102, 126, 234, 0.3); }"
    ".btn:active { transform: translateY(0); }"
    ".btn-secondary { background: #718096; font-size: 0.9rem; padding: 0.625rem 1rem; }"
    ".btn-secondary:hover { background: #4a5568; box-shadow: 0 5px 15px rgba(113, 128, 150, 0.3); }"
    ".loading { display: none; text-align: center; color: #718096; font-style: italic; }"
    ".status-message { padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem; text-align: center; font-weight: 500; display: none; }"
    ".status-success { background: #c6f6d5; color: #22543d; border: 1px solid #9ae6b4; }"
    ".status-error { background: #fed7d7; color: #742a2a; border: 1px solid #fc8181; }"
    ".spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #ffffff; border-radius: 50%; border-top-color: transparent; animation: spin 1s ease-in-out infinite; margin-right: 0.5rem; }"
    "@keyframes spin { to { transform: rotate(360deg); } }"
    ".hidden { display: none !important; }"
    ".selected-network-info { background: #edf2f7; border: 1px solid #cbd5e0; border-radius: 12px; padding: 1rem; margin-bottom: 1rem; }"
    ".selected-network-name { font-weight: 600; font-size: 1.1rem; color: #2d3748; margin-bottom: 0.5rem; }"
    ".selected-network-details { color: #718096; font-size: 0.9rem; }"
    "</style>"
    "</head>"
    "<body>"
    "<div class=\"container\">"
    "<div class=\"header\">"
    "<span class=\"welcome-icon\">🏠</span>"
    "<h1 class=\"title\">Welcome to Your Smart Home</h1>"
    "<p class=\"subtitle\">Select a WiFi network below to connect your device</p>"
    "</div>"
    "<div class=\"status-message\" id=\"statusMessage\"></div>"
    "<div class=\"section\">"
    "<h3 class=\"section-title\">📡 Available WiFi Networks</h3>"
    "<div class=\"networks-list\" id=\"networksList\">"
    "<div class=\"loading\" id=\"networksLoading\">"
    "<span class=\"spinner\"></span>Scanning for networks..."
    "</div>"
    "</div>"
    "<button class=\"btn btn-secondary\" onclick=\"scanNetworks()\">Refresh Networks</button>"
    "</div>"
    "<div class=\"section\" id=\"passwordSection\" style=\"display: none;\">"
    "<div class=\"selected-network-info\" id=\"selectedNetworkInfo\"></div>"
    "<div class=\"form-group\">"
    "<label class=\"form-label\" for=\"password\">Enter Password:</label>"
    "<input type=\"password\" id=\"password\" class=\"form-input\" placeholder=\"Enter WiFi password\" autofocus onkeypress=\"if(event.key==='Enter')connectToWiFi()\">"
    "</div>"
    "<button class=\"btn\" onclick=\"connectToWiFi()\" id=\"connectBtn\">Connect to WiFi</button>"
    "<button class=\"btn btn-secondary\" onclick=\"cancelSelection()\">Go Back</button>"
    "</div>"
    "<div class=\"section\">"
    "<button class=\"btn btn-secondary\" onclick=\"testConnection()\">Test Connection</button>"
    "<button class=\"btn btn-secondary\" onclick=\"window.location.href='/debug'\">Debug Info</button>"
    "</div>"
    "</div>"
    "<script>"
    "let selectedSSID = '';"
    "function showStatus(message, isError) {"
    "const statusEl = document.getElementById('statusMessage');"
    "statusEl.textContent = message;"
    "statusEl.className = 'status-message ' + (isError ? 'status-error' : 'status-success');"
    "statusEl.style.display = 'block';"
    "setTimeout(function() { statusEl.style.display = 'none'; }, 5000);"
    "}"
    "function scanNetworks() {"
    "console.log('Starting network scan...');"
    "const loadingEl = document.getElementById('networksLoading');"
    "const listEl = document.getElementById('networksList');"
    "loadingEl.style.display = 'block';"
    "listEl.innerHTML = '<div class=\"loading\" id=\"networksLoading\"><span class=\"spinner\"></span>Scanning for networks...</div>';"
    "fetch('/scan')"
    ".then(function(response) {"
    "console.log('Scan response status:', response.status);"
    "if (!response.ok) {"
    "throw new Error('Network response was not ok: ' + response.status);"
    "}"
    "return response.json();"
    "})"
    ".then(function(data) {"
    "console.log('Scan data received:', data);"
    "if (data.error) {"
    "throw new Error(data.error);"
    "}"
    "displayNetworks(data.networks || []);"
    "})"
    ".catch(function(error) {"
    "console.error('Error scanning networks:', error);"
    "showStatus('Error scanning networks: ' + error.message + '. Please try again.', true);"
    "loadingEl.style.display = 'none';"
    "listEl.innerHTML = '<div style=\"padding: 1rem; text-align: center; color: #e53e3e;\">Scan failed. Click Refresh to try again.</div>';"
    "});"
    "}"
    "function displayNetworks(networks) {"
    "const listEl = document.getElementById('networksList');"
    "if (networks.length === 0) {"
    "listEl.innerHTML = '<div style=\"padding: 1rem; text-align: center; color: #718096;\">No networks found</div>';"
    "return;"
    "}"
    "listEl.innerHTML = '';"
    "for (let i = 0; i < networks.length; i++) {"
    "const network = networks[i];"
    "const networkEl = document.createElement('div');"
    "networkEl.className = 'network-item';"
    "networkEl.onclick = function() { selectNetwork(network.ssid, networkEl); };"
    "let signalIcon = '';"
    "let signalColor = '';"
    "if (network.rssi > -50) { signalIcon = '▰▰▰▰'; signalColor = '#48bb78'; }"
    "else if (network.rssi > -60) { signalIcon = '▰▰▰▱'; signalColor = '#68d391'; }"
    "else if (network.rssi > -70) { signalIcon = '▰▰▱▱'; signalColor = '#f6ad55'; }"
    "else if (network.rssi > -80) { signalIcon = '▰▱▱▱'; signalColor = '#fc8181'; }"
    "else { signalIcon = '▱▱▱▱'; signalColor = '#e53e3e'; }"
    "networkEl.innerHTML = '<span class=\"network-name\">' + network.ssid + '</span><span class=\"network-signal\" style=\"color:' + signalColor + '\">' + signalIcon + '</span><span class=\"network-security\">' + network.security + '</span>';"
    "listEl.appendChild(networkEl);"
    "}"
    "}"
    "function selectNetwork(ssid, element) {"
    "const items = document.querySelectorAll('.network-item');"
    "for (let i = 0; i < items.length; i++) { items[i].classList.remove('selected'); }"
    "element.classList.add('selected');"
    "selectedSSID = ssid;"
    "showPasswordSection(ssid, element);"
    "}"
    "function showPasswordSection(ssid, networkElement) {"
    "const passwordSection = document.getElementById('passwordSection');"
    "const networkInfo = document.getElementById('selectedNetworkInfo');"
    "const passwordInput = document.getElementById('password');"
    "const signalSpan = networkElement.querySelector('.network-signal');"
    "const securitySpan = networkElement.querySelector('.network-security');"
    "const signalIcon = signalSpan ? signalSpan.textContent : '';"
    "const security = securitySpan ? securitySpan.textContent : 'Unknown';"
    "networkInfo.innerHTML = '<div class=\"selected-network-name\">📶 ' + ssid + '</div><div class=\"selected-network-details\">Signal: ' + signalIcon + ' | Security: ' + security + '</div>';"
    "passwordSection.style.display = 'block';"
    "passwordInput.value = '';"
    "passwordInput.focus();"
    "passwordSection.scrollIntoView({ behavior: 'smooth' });"
    "}"
    "function cancelSelection() {"
    "const passwordSection = document.getElementById('passwordSection');"
    "const items = document.querySelectorAll('.network-item');"
    "for (let i = 0; i < items.length; i++) { items[i].classList.remove('selected'); }"
    "selectedSSID = '';"
    "passwordSection.style.display = 'none';"
    "document.getElementById('networksList').scrollIntoView({ behavior: 'smooth' });"
    "}"
    "function connectToWiFi() {"
    "const password = document.getElementById('password').value;"
    "const connectBtn = document.getElementById('connectBtn');"
    "if (!selectedSSID) { showStatus('Please select a network first.', true); return; }"
    "connectBtn.innerHTML = '<span class=\"spinner\"></span>Connecting...';"
    "connectBtn.disabled = true;"
    "const formData = new FormData();"
    "formData.append('ssid', selectedSSID);"
    "formData.append('password', password);"
    "fetch('/connect', { method: 'POST', body: formData }).then(function(response) { return response.json(); }).then(function(data) {"
    "if (data.success) {"
    "showStatus(data.message);"
    "setTimeout(function() { showStatus('Device is restarting. You can close this page.'); }, 2000);"
    "} else {"
    "showStatus(data.message, true);"
    "connectBtn.innerHTML = 'Connect to WiFi';"
    "connectBtn.disabled = false;"
    "}"
    "}).catch(function(error) {"
    "console.error('Error connecting:', error);"
    "showStatus('Connection failed. Please try again.', true);"
    "connectBtn.innerHTML = 'Connect to WiFi';"
    "connectBtn.disabled = false;"
    "});"
    "}"
    "function testConnection() {"
    "fetch('/status').then(function(response) {"
    "return response.json();"
    "}).then(function(data) {"
    "showStatus('Device is responding: ' + JSON.stringify(data));"
    "}).catch(function(error) {"
    "showStatus('Connection test failed: ' + error.message, true);"
    "});"
    "}"
    "window.onload = function() { scanNetworks(); };"
    "</script>"
    "</body>"
    "</html>";
    
    return html;
}
