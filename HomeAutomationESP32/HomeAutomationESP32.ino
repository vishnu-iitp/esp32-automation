/*
 * ESP32 Home Automation System with Supabase Integration and Multi-User Support
 * 
 * Features:
 * - Multi-user device claiming system
 * - EEPROM-based claimed status tracking
 * - Auto-registration for unclaimed devices
 * - Real-time device control via Supabase WebSocket for claimed devices
 * - Periodic claim status checking for unclaimed devices
 * - Custom MAC address based device identification
 * 
 * Author: ESP32 Home Automation Team
 * Version: 3.1 (Custom MAC Address Support)
 */

#include <WiFi.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>
#include <HTTPClient.h>
#include <EEPROM.h>
#include "WiFiManager.h"

// =================== CONFIGURATION ===================
const char* SUPABASE_PROJECT_ID = "ahmseisassvgxbbccqyd";
const char* SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFobXNlaXNhc3N2Z3hiYmNjcXlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzOTgyNDEsImV4cCI6MjA3MTk3NDI0MX0.VR3dkEUvDzkH8s9YXQq3E3XCRSu62ldE1Qs9-DI1CaI";

// Custom MAC Address Configuration (modify this to create unique device identifiers)
const char* CUSTOM_MAC_ADDRESS = "10:22:FB:3F:A0:3F";

// EEPROM Configuration
const int EEPROM_SIZE = 512;
const int CLAIMED_STATUS_ADDR = 0; // Address for claimed status flag
const byte UNCLAIMED = 0;
const byte CLAIMED = 1;

// Device Configuration
const int DEVICE_PINS[] = {23, 22, 21, 19, 18, 5, 4, 2};
const int NUM_PINS = sizeof(DEVICE_PINS) / sizeof(DEVICE_PINS[0]);
const int RESET_BUTTON_PIN = 5; // GPIO 0 (BOOT button) for WiFi reset

// Timing Configuration
const unsigned long HEARTBEAT_INTERVAL = 30000; // 30 seconds
const unsigned long CLAIM_CHECK_INTERVAL = 30000; // 30 seconds for unclaimed devices
const unsigned long REGISTRATION_RETRY_INTERVAL = 60000; // 1 minute
const unsigned long FACTORY_RESET_HOLD_TIME = 10000; // 10 seconds for factory reset

// =================== GLOBAL VARIABLES ===================
ModernWiFiManager wifiManager;
WebSocketsClient webSocket;
HTTPClient http;
int messageRef = 1;
bool initializedPins[40] = {false}; // Track which pins have been initialized
String deviceMacAddress;
bool isDeviceClaimed = false;
unsigned long lastClaimCheck = 0;
unsigned long lastRegistrationAttempt = 0;
bool registrationComplete = false;

// =================== FUNCTION DECLARATIONS ===================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length);
void handleWebSocketMessage(uint8_t * payload, size_t length);
void subscribeToDevicesTable();
void sendHeartbeat();
void initializeGPIO(int gpio);
String getMacAddress(); // Helper function to get hardware MAC (for debugging)
bool getClaimedStatus();
void setClaimedStatus(bool claimed);
bool registerUnclaimedDevice();
bool checkClaimStatus();
void setupClaimedDevice();
void setupUnclaimedDevice();
bool fetchAndSetInitialDeviceStates();
void checkResetButton();
void triggerFactoryReset();

void setup() {
    Serial.begin(115200);
    Serial.println("\n=== ESP32 Home Automation (Multi-User Version with WiFi Manager) ===");
    
    // Initialize EEPROM
    EEPROM.begin(EEPROM_SIZE);
    
    // Set custom MAC address (instead of hardware MAC)
    deviceMacAddress = String(CUSTOM_MAC_ADDRESS);
    Serial.println("Device MAC Address: " + deviceMacAddress);
    
    // Check claimed status from EEPROM
    isDeviceClaimed = getClaimedStatus();
    Serial.println("Device claimed status: " + String(isDeviceClaimed ? "CLAIMED" : "UNCLAIMED"));
    
    // Initialize predefined device pins
    for (int i = 0; i < NUM_PINS; i++) {
        initializeGPIO(DEVICE_PINS[i]);
    }
    
    // Initialize reset button
    pinMode(RESET_BUTTON_PIN, INPUT_PULLUP);

    // Initialize WiFi Manager and connect
    wifiManager.begin();
    
    // Wait for WiFi connection or config mode
    while (wifiManager.isInConfigMode()) {
        wifiManager.handleClient();
        delay(10);
    }
    
    // WiFi is connected, proceed with normal operation
    Serial.println("WiFi connected! Continuing with normal operation...");

    if (isDeviceClaimed) {
        setupClaimedDevice();
    } else {
        setupUnclaimedDevice();
    }
}

void loop() {
    // Check for WiFi reset button press
    checkResetButton();
    
    // Handle WiFi Manager if in config mode
    if (wifiManager.isInConfigMode()) {
        wifiManager.handleClient();
        return;
    }
    
    if (isDeviceClaimed) {
        // Normal operation for claimed devices
        webSocket.loop();
        static unsigned long lastHeartbeat = 0;
        if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL) {
            sendHeartbeat();
            lastHeartbeat = millis();
        }
    } else {
        // Unclaimed device behavior
        unsigned long currentTime = millis();
        
        // Register as unclaimed device if not done yet
        if (!registrationComplete && (currentTime - lastRegistrationAttempt > REGISTRATION_RETRY_INTERVAL)) {
            if (registerUnclaimedDevice()) {
                registrationComplete = true;
                Serial.println("Successfully registered as unclaimed device");
            } else {
                Serial.println("Failed to register as unclaimed device, will retry...");
            }
            lastRegistrationAttempt = currentTime;
        }
        
        // Check claim status periodically
        if (currentTime - lastClaimCheck > CLAIM_CHECK_INTERVAL) {
            Serial.println("Checking claim status...");
            if (checkClaimStatus()) {
                Serial.println("Device has been claimed! Updating EEPROM and rebooting...");
                setClaimedStatus(true);
                delay(1000);
                ESP.restart();
            }
            lastClaimCheck = currentTime;
        }
        
        delay(1000); // Prevent busy loop
    }
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch (type) {
        case WStype_DISCONNECTED:
            Serial.println("WebSocket Disconnected.");
            break;
        case WStype_CONNECTED:
            Serial.println("WebSocket Connected!");
            subscribeToDevicesTable();
            break;
        case WStype_TEXT:
            handleWebSocketMessage(payload, length);
            break;
        default:
            break;
    }
}

void subscribeToDevicesTable() {
    DynamicJsonDocument doc(1024);
    doc["topic"] = "realtime:public:devices";
    doc["event"] = "phx_join";
    
    // Subscribe to UPDATE events for this specific device's MAC address
    doc["payload"]["config"]["postgres_changes"][0]["event"] = "UPDATE";
    doc["payload"]["config"]["postgres_changes"][0]["schema"] = "public";
    doc["payload"]["config"]["postgres_changes"][0]["table"] = "devices";
    doc["payload"]["config"]["postgres_changes"][0]["filter"] = "mac_address=eq." + deviceMacAddress;
    
    doc["ref"] = messageRef++;
    
    String message;
    serializeJson(doc, message);
    webSocket.sendTXT(message);
    Serial.println("Subscribing to device updates for MAC: " + deviceMacAddress);
}

void handleWebSocketMessage(uint8_t * payload, size_t length) {
    Serial.printf("Raw WebSocket Message: %s\n", payload);

    DynamicJsonDocument doc(2048);
    deserializeJson(doc, payload, length);

    String event = doc["event"];
    if (event == "phx_reply") {
        Serial.println("Subscription to devices table successful.");
    } else if (event == "postgres_changes") {
        
        String eventType = doc["payload"]["data"]["type"];
        JsonObject data = doc["payload"]["data"]["record"];

        if (!data) {
            Serial.println("Could not find 'record' object in payload. Skipping.");
            return;
        }
        
        // Only process if this is for our device
        const char* messageMac = data["mac_address"];
        if (!messageMac || String(messageMac) != deviceMacAddress) {
            Serial.println("Message not for this device, ignoring.");
            return;
        }
        
        int gpio = data["gpio"];
        int state = data["state"];
        const char* deviceName = data["name"];
        
        if (eventType == "UPDATE") {
            Serial.printf("Device update - GPIO %d, new state: %d", gpio, state);
            
            if (deviceName) {
                Serial.printf(", device name: %s", deviceName);
            }
            Serial.println();
            
            // Update GPIO state
            if (gpio >= 0 && gpio <= 39) {
                if (!initializedPins[gpio]) {
                    initializeGPIO(gpio);
                    Serial.printf("GPIO %d initialized on first use\n", gpio);
                }
                
                digitalWrite(gpio, state == 1 ? HIGH : LOW);
            } else {
                Serial.printf("Invalid GPIO %d\n", gpio);
            }
        }
    }
}

// Helper function to initialize GPIO pins
void initializeGPIO(int gpio) {
    if (gpio >= 0 && gpio <= 39 && !initializedPins[gpio]) {
        pinMode(gpio, OUTPUT);
        digitalWrite(gpio, LOW); // Start in OFF state
        initializedPins[gpio] = true;
        Serial.printf("GPIO %d configured as OUTPUT\n", gpio);
    }
}

void sendHeartbeat() {
    DynamicJsonDocument doc(256);
    doc["topic"] = "phoenix";
    doc["event"] = "heartbeat";
    doc["payload"] = JsonObject();
    doc["ref"] = messageRef++;
    
    String message;
    serializeJson(doc, message);
    webSocket.sendTXT(message);
    Serial.println("Heartbeat sent.");
}

// =================== MULTI-USER SUPPORT FUNCTIONS ===================

// Helper function to get hardware MAC address (for debugging purposes)
// Note: The system now uses CUSTOM_MAC_ADDRESS instead of hardware MAC
String getMacAddress() {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    char macStr[18];
    sprintf(macStr, "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    return String(macStr);
}

bool getClaimedStatus() {
    byte status = EEPROM.read(CLAIMED_STATUS_ADDR);
    return (status == CLAIMED);
}

void setClaimedStatus(bool claimed) {
    EEPROM.write(CLAIMED_STATUS_ADDR, claimed ? CLAIMED : UNCLAIMED);
    EEPROM.commit();
    Serial.println("Claimed status updated in EEPROM: " + String(claimed ? "CLAIMED" : "UNCLAIMED"));
}

void setupClaimedDevice() {
    Serial.println("Setting up claimed device - connecting to real-time WebSocket...");
    
    // Fetch and set initial device states before connecting to WebSocket
    Serial.println("Fetching initial device states...");
    if (fetchAndSetInitialDeviceStates()) {
        Serial.println("Initial device states set successfully");
    } else {
        Serial.println("Warning: Could not fetch initial device states");
    }
    
    // Setup Supabase WebSocket connection
    String host = String(SUPABASE_PROJECT_ID) + ".supabase.co";
    String path = "/realtime/v1/websocket?apikey=" + String(SUPABASE_ANON_KEY) + "&vsn=1.0.0";
    
    webSocket.beginSSL(host.c_str(), 443, path.c_str());
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(5000);
}

void setupUnclaimedDevice() {
    Serial.println("Setting up unclaimed device - will register and check for claim status...");
    lastClaimCheck = millis();
    lastRegistrationAttempt = millis() - REGISTRATION_RETRY_INTERVAL; // Allow immediate registration attempt
    registrationComplete = false;
}

bool registerUnclaimedDevice() {
    Serial.println("Registering unclaimed device...");
    
    http.begin("https://" + String(SUPABASE_PROJECT_ID) + ".supabase.co/functions/v1/register-unclaimed-device");
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));
    
    DynamicJsonDocument doc(256);
    doc["mac_address"] = deviceMacAddress;
    doc["device_name"] = "Smart bulb";
    doc["gpio"] = 23;
    
    String payload;
    serializeJson(doc, payload);
    
    int httpCode = http.POST(payload);
    
    if (httpCode == 200) {
        String response = http.getString();
        Serial.println("Registration response: " + response);
        
        DynamicJsonDocument responseDoc(512);
        deserializeJson(responseDoc, response);
        
        bool success = responseDoc["success"];
        http.end();
        return success;
    } else {
        Serial.println("Registration failed. HTTP code: " + String(httpCode));
        if (httpCode > 0) {
            Serial.println("Response: " + http.getString());
        }
        http.end();
        return false;
    }
}

bool checkClaimStatus() {
    Serial.println("Checking if device has been claimed...");
    
    // Make HTTP request to check if our device now has a user_id
    http.begin("https://" + String(SUPABASE_PROJECT_ID) + ".supabase.co/rest/v1/devices?mac_address=eq." + deviceMacAddress + "&select=user_id");
    http.addHeader("apikey", SUPABASE_ANON_KEY);
    http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));
    
    int httpCode = http.GET();
    
    if (httpCode == 200) {
        String response = http.getString();
        Serial.println("Claim check response: " + response);
        
        DynamicJsonDocument doc(512);
        deserializeJson(doc, response);
        
        if (doc.size() > 0 && !doc[0]["user_id"].isNull()) {
            Serial.println("Device has been claimed by user: " + String(doc[0]["user_id"].as<String>()));
            http.end();
            return true;
        }
    } else {
        Serial.println("Claim check failed. HTTP code: " + String(httpCode));
        if (httpCode > 0) {
            Serial.println("Response: " + http.getString());
        }
    }
    
    http.end();
    return false;
}

bool fetchAndSetInitialDeviceStates() {
    Serial.println("Fetching device states from Supabase...");
    
    http.begin("https://" + String(SUPABASE_PROJECT_ID) + ".supabase.co/functions/v1/get-device-states");
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));
    
    DynamicJsonDocument requestDoc(256);
    requestDoc["mac_address"] = deviceMacAddress;
    
    String requestPayload;
    serializeJson(requestDoc, requestPayload);
    
    int httpCode = http.POST(requestPayload);
    
    if (httpCode == 200) {
        String response = http.getString();
        Serial.println("Device states response: " + response);
        
        DynamicJsonDocument responseDoc(2048);
        DeserializationError error = deserializeJson(responseDoc, response);
        
        if (error) {
            Serial.println("Failed to parse device states response: " + String(error.c_str()));
            http.end();
            return false;
        }
        
        bool success = responseDoc["success"];
        bool claimed = responseDoc["claimed"];
        
        if (!success) {
            Serial.println("Error fetching device states: " + String(responseDoc["error"].as<String>()));
            http.end();
            return false;
        }
        
        if (!claimed) {
            Serial.println("Device is not claimed yet, skipping state fetch");
            http.end();
            return true; // Not an error, just not claimed
        }
        
        JsonArray devices = responseDoc["devices"];
        int deviceCount = responseDoc["device_count"];
        
        Serial.println("Found " + String(deviceCount) + " devices to initialize");
        
        // Apply the states to GPIO pins
        for (JsonObject device : devices) {
            int gpio = device["gpio"];
            int state = device["state"];
            String name = device["name"];
            
            Serial.printf("Setting device '%s' on GPIO %d to state %d\n", 
                         name.c_str(), gpio, state);
            
            // Initialize GPIO if not already done
            if (gpio >= 0 && gpio <= 39) {
                if (!initializedPins[gpio]) {
                    initializeGPIO(gpio);
                    Serial.printf("GPIO %d initialized for device state fetch\n", gpio);
                }
                
                // Set the GPIO to the stored state
                digitalWrite(gpio, state == 1 ? HIGH : LOW);
                
                Serial.printf("GPIO %d set to %s\n", gpio, state == 1 ? "HIGH" : "LOW");
            } else {
                Serial.printf("Invalid GPIO %d for device '%s'\n", gpio, name.c_str());
            }
        }
        
        http.end();
        return true;
        
    } else {
        Serial.println("Failed to fetch device states. HTTP code: " + String(httpCode));
        if (httpCode > 0) {
            String errorResponse = http.getString();
            Serial.println("Error response: " + errorResponse);
        }
        http.end();
        return false;
    }
}

// =================== RESET BUTTON FUNCTIONALITY ===================
void checkResetButton() {
    static unsigned long buttonPressTime = 0;
    static bool buttonPressed = false;

    if (digitalRead(RESET_BUTTON_PIN) == LOW) { // Button pressed (active low)
        if (!buttonPressed) {
            buttonPressed = true;
            buttonPressTime = millis();
            Serial.println("Reset button pressed...");
        }

        // Check if button held for 10 seconds for factory reset
        if (millis() - buttonPressTime > FACTORY_RESET_HOLD_TIME) {
            triggerFactoryReset();
            // The resetWiFiSettings in triggerFactoryReset will restart the device
        }
    } else {
        if (buttonPressed) {
            buttonPressed = false;
            unsigned long pressDuration = millis() - buttonPressTime;

            // If held for more than 5 seconds but less than 10, just reset WiFi
            if (pressDuration > 5000 && pressDuration < FACTORY_RESET_HOLD_TIME) {
                 Serial.println("Reset button held for 5 seconds. Resetting WiFi settings...");
                 wifiManager.resetWiFiSettings();
            } else if (pressDuration < 5000) {
                Serial.println("Reset button released (hold for 5s to reset WiFi, 10s for factory reset)");
            }
        }
    }
}

// =================== FACTORY RESET FUNCTIONALITY ===================
void triggerFactoryReset() {
    Serial.println("!!! FACTORY RESET TRIGGERED !!!");

    http.begin("https://" + String(SUPABASE_PROJECT_ID) + ".supabase.co/functions/v1/factory-reset-device");
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));

    DynamicJsonDocument doc(256);
    doc["mac_address"] = deviceMacAddress;

    String payload;
    serializeJson(doc, payload);

    int httpCode = http.POST(payload);

    if (httpCode == 200) {
        Serial.println("Device successfully reset in the database.");
        setClaimedStatus(false); // Set as unclaimed in EEPROM
        wifiManager.resetWiFiSettings(); // This will also trigger a restart
    } else {
        Serial.println("Failed to reset device in the database. HTTP code: " + String(httpCode));
        if (httpCode > 0) {
            Serial.println("Response: " + http.getString());
        }
    }

    http.end();
}