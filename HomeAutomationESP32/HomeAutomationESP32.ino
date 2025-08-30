/*
 * ESP32 Home Automation System with Secure Supabase Integration
 * 
 * Features:
 * - Self-provisioning workflow for new devices
 * - Secure JWT-based authentication after claiming
 * - Real-time device control via Supabase WebSocket
 * - Robust EEPROM credential management
 * - Automatic fallback to provisioning mode if credentials are invalid
 * 
 * Author: ESP32 Home Automation Team
 * Version: 3.0 (Secure Provisioning System)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>
#include <EEPROM.h>

// =================== CONFIGURATION ===================
const char* WIFI_SSID = "JioFiber-vishnu_4G";
const char* WIFI_PASSWORD = "aeasap975";
const char* SUPABASE_PROJECT_ID = "ahmseisassvgxbbccqyd";
const char* SUPABASE_URL = "https://ahmseisassvgxbbccqyd.supabase.co";
const char* SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFobXNlaXNhc3N2Z3hiYmNjcXlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzOTgyNDEsImV4cCI6MjA3MTk3NDI0MX0.VR3dkEUvDzkH8s9YXQq3E3XCRSu62ldE1Qs9-DI1CaI";

// EEPROM Configuration
#define EEPROM_SIZE 1024
#define DEVICE_JWT_ADDR 0
#define USER_ID_ADDR 256
#define DEVICE_ID_ADDR 512
#define CREDENTIALS_VALID_ADDR 768
#define MAX_JWT_SIZE 255
#define MAX_USER_ID_SIZE 255

// Device Configuration
const int DEVICE_PINS[] = {23, 22, 21, 19, 18, 5, 4, 2};
const int NUM_PINS = sizeof(DEVICE_PINS) / sizeof(DEVICE_PINS[0]);
const unsigned long HEARTBEAT_INTERVAL = 30000; // 30 seconds
const unsigned long POLLING_INTERVAL = 15000;   // 15 seconds for polling

// =================== GLOBAL VARIABLES ===================
WebSocketsClient webSocket;
HTTPClient http;
int messageRef = 1;
bool initializedPins[40] = {false}; // Track which pins have been initialized

// Device credentials
String deviceJwt = "";
String userId = "";
int deviceId = -1;
bool isProvisioned = false;

// =================== FUNCTION DECLARATIONS ===================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length);
void handleWebSocketMessage(uint8_t * payload, size_t length);
void subscribeToDevicesTable();
void sendHeartbeat();
void initializeGPIO(int gpio);

// Provisioning functions
bool loadAndValidateCredentials();
void saveCredentials(const String& jwt, const String& uid, int devId);
void clearCredentials();
bool provisionDevice();
bool pollForCredentials();
String getMacAddress();
void connectToSupabaseWebSocket();

void setup() {
    Serial.begin(115200);
    Serial.println("\n=== ESP32 Home Automation (Secure Provisioning) ===");
    
    // Initialize EEPROM
    EEPROM.begin(EEPROM_SIZE);
    
    // Initialize predefined device pins
    for (int i = 0; i < NUM_PINS; i++) {
        initializeGPIO(DEVICE_PINS[i]);
    }

    // Connect to WiFi
    Serial.println("Connecting to WiFi...");
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWiFi connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());

    // Try to load saved credentials
    if (loadAndValidateCredentials()) {
        Serial.println("Valid credentials found. Connecting to Supabase...");
        isProvisioned = true;
        connectToSupabaseWebSocket();
    } else {
        Serial.println("No valid credentials found. Starting provisioning process...");
        isProvisioned = false;
        
        // Start provisioning process
        if (provisionDevice()) {
            Serial.println("Device registered successfully. Waiting for user to claim...");
            // Start polling for credentials
            while (!isProvisioned) {
                if (pollForCredentials()) {
                    Serial.println("Device claimed! Restarting to operational mode...");
                    delay(2000);
                    ESP.restart();
                }
                delay(POLLING_INTERVAL);
            }
        } else {
            Serial.println("Provisioning failed. Will retry on next boot.");
            delay(10000);
            ESP.restart();
        }
void loop() {
    if (isProvisioned) {
        webSocket.loop();
        static unsigned long lastHeartbeat = 0;
        if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL) {
            sendHeartbeat();
            lastHeartbeat = millis();
        }
    } else {
        // Continue polling if not provisioned yet
        if (pollForCredentials()) {
            Serial.println("Device claimed! Restarting to operational mode...");
            delay(2000);
            ESP.restart();
        }
        delay(POLLING_INTERVAL);
    }
}

// =================== CREDENTIAL MANAGEMENT ===================

bool loadAndValidateCredentials() {
    // Check if credentials are marked as valid
    uint8_t credentialsValid = EEPROM.read(CREDENTIALS_VALID_ADDR);
    if (credentialsValid != 0xAA) {
        Serial.println("No valid credentials marker found.");
        return false;
    }

    // Read device JWT
    char jwtBuffer[MAX_JWT_SIZE + 1] = {0};
    for (int i = 0; i < MAX_JWT_SIZE; i++) {
        jwtBuffer[i] = EEPROM.read(DEVICE_JWT_ADDR + i);
        if (jwtBuffer[i] == 0) break;
    }
    deviceJwt = String(jwtBuffer);

    // Read user ID
    char userIdBuffer[MAX_USER_ID_SIZE + 1] = {0};
    for (int i = 0; i < MAX_USER_ID_SIZE; i++) {
        userIdBuffer[i] = EEPROM.read(USER_ID_ADDR + i);
        if (userIdBuffer[i] == 0) break;
    }
    userId = String(userIdBuffer);

    // Read device ID
    deviceId = 0;
    for (int i = 0; i < 4; i++) {
        deviceId |= (EEPROM.read(DEVICE_ID_ADDR + i) << (i * 8));
    }

    // Validate that we have all required credentials
    if (deviceJwt.length() < 10 || userId.length() < 10 || deviceId <= 0) {
        Serial.println("Invalid credentials format found.");
        clearCredentials();
        return false;
    }

    Serial.printf("Loaded credentials: DeviceID=%d, UserID=%s, JWT length=%d\n", 
                  deviceId, userId.c_str(), deviceJwt.length());
    return true;
}

void saveCredentials(const String& jwt, const String& uid, int devId) {
    Serial.println("Saving credentials to EEPROM...");
    
    // Clear the credential areas first
    for (int i = 0; i < MAX_JWT_SIZE; i++) {
        EEPROM.write(DEVICE_JWT_ADDR + i, 0);
    }
    for (int i = 0; i < MAX_USER_ID_SIZE; i++) {
        EEPROM.write(USER_ID_ADDR + i, 0);
    }
    for (int i = 0; i < 4; i++) {
        EEPROM.write(DEVICE_ID_ADDR + i, 0);
    }

    // Save device JWT
    for (int i = 0; i < jwt.length() && i < MAX_JWT_SIZE - 1; i++) {
        EEPROM.write(DEVICE_JWT_ADDR + i, jwt[i]);
    }

    // Save user ID
    for (int i = 0; i < uid.length() && i < MAX_USER_ID_SIZE - 1; i++) {
        EEPROM.write(USER_ID_ADDR + i, uid[i]);
    }

    // Save device ID (as 4 bytes)
    for (int i = 0; i < 4; i++) {
        EEPROM.write(DEVICE_ID_ADDR + i, (devId >> (i * 8)) & 0xFF);
    }

    // Mark credentials as valid
    EEPROM.write(CREDENTIALS_VALID_ADDR, 0xAA);
    
    // Commit to EEPROM
    EEPROM.commit();
    
    // Update global variables
    deviceJwt = jwt;
    userId = uid;
    deviceId = devId;
    
    Serial.println("Credentials saved successfully.");
}

void clearCredentials() {
    Serial.println("Clearing stored credentials...");
    
    // Clear all credential areas
    for (int i = 0; i < EEPROM_SIZE; i++) {
        EEPROM.write(i, 0);
    }
    EEPROM.commit();
    
    // Reset global variables
    deviceJwt = "";
    userId = "";
    deviceId = -1;
    isProvisioned = false;
}

// =================== PROVISIONING FUNCTIONS ===================

bool provisionDevice() {
    Serial.println("Starting device provisioning...");
    
    String macAddress = getMacAddress();
    String defaultName = "ESP32_" + macAddress.substring(macAddress.length() - 6);
    
    http.begin(String(SUPABASE_URL) + "/rest/v1/devices");
    http.addHeader("Content-Type", "application/json");
    http.addHeader("apikey", SUPABASE_ANON_KEY);
    http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));
    http.addHeader("Prefer", "return=representation");

    // Create JSON payload
    DynamicJsonDocument doc(512);
    doc["mac_address"] = macAddress;
    doc["name"] = defaultName;
    doc["gpio"] = 23; // Default GPIO for first device
    doc["state"] = 0;  // Default OFF state
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    Serial.printf("Registering device: %s\n", jsonString.c_str());
    
    int httpResponseCode = http.POST(jsonString);
    
    if (httpResponseCode == 201) {
        String response = http.getString();
        Serial.printf("Registration response: %s\n", response.c_str());
        
        // Parse response to get device ID
        DynamicJsonDocument responseDoc(1024);
        deserializeJson(responseDoc, response);
        
        if (responseDoc.is<JsonArray>() && responseDoc.size() > 0) {
            deviceId = responseDoc[0]["id"];
            Serial.printf("Device registered with ID: %d\n", deviceId);
            http.end();
            return true;
        } else {
            Serial.println("Failed to parse device ID from response");
        }
    } else {
        String errorResponse = http.getString();
        Serial.printf("Registration failed with code %d: %s\n", httpResponseCode, errorResponse.c_str());
    }
    
    http.end();
    return false;
}

bool pollForCredentials() {
    if (deviceId <= 0) {
        Serial.println("No device ID available for polling");
        return false;
    }
    
    String url = String(SUPABASE_URL) + "/rest/v1/devices?id=eq." + String(deviceId) + "&select=user_id,device_jwt";
    
    http.begin(url);
    http.addHeader("apikey", SUPABASE_ANON_KEY);
    http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));
    
    int httpResponseCode = http.GET();
    
    if (httpResponseCode == 200) {
        String response = http.getString();
        
        DynamicJsonDocument doc(1024);
        deserializeJson(doc, response);
        
        if (doc.is<JsonArray>() && doc.size() > 0) {
            JsonObject device = doc[0];
            
            // Check if user_id and device_jwt are populated
            if (!device["user_id"].isNull() && !device["device_jwt"].isNull()) {
                String receivedUserId = device["user_id"];
                String receivedJwt = device["device_jwt"];
                
                Serial.println("Device has been claimed! Saving credentials...");
                saveCredentials(receivedJwt, receivedUserId, deviceId);
                
                http.end();
                return true;
            } else {
                Serial.println("Device not yet claimed, continuing to poll...");
            }
        }
    } else {
        Serial.printf("Polling failed with code %d\n", httpResponseCode);
    }
    
    http.end();
    return false;
}

String getMacAddress() {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    char macStr[18] = {0};
    sprintf(macStr, "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    return String(macStr);
}

// =================== WEBSOCKET FUNCTIONS ===================

void connectToSupabaseWebSocket() {
    String host = String(SUPABASE_PROJECT_ID) + ".supabase.co";
    String path = "/realtime/v1/websocket?apikey=" + String(SUPABASE_ANON_KEY) + "&vsn=1.0.0";
    
    // Add device JWT for authentication
    if (deviceJwt.length() > 10) {
        path += "&jwt=" + deviceJwt;
        Serial.println("Connecting with device JWT authentication...");
    } else {
        Serial.println("Warning: No device JWT available!");
        return;
    }
    
    webSocket.beginSSL(host.c_str(), 443, path.c_str());
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(5000);
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
    
    // Subscribe to both UPDATE and INSERT events
    doc["payload"]["config"]["postgres_changes"][0]["event"] = "UPDATE";
    doc["payload"]["config"]["postgres_changes"][0]["schema"] = "public";
    doc["payload"]["config"]["postgres_changes"][0]["table"] = "devices";
    
    doc["payload"]["config"]["postgres_changes"][1]["event"] = "INSERT";
    doc["payload"]["config"]["postgres_changes"][1]["schema"] = "public";
    doc["payload"]["config"]["postgres_changes"][1]["table"] = "devices";
    
    doc["ref"] = messageRef++;
    
    String message;
    serializeJson(doc, message);
    webSocket.sendTXT(message);
    Serial.println("Subscribing to devices table updates and inserts...");
}

void handleWebSocketMessage(uint8_t * payload, size_t length) {
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, payload, length);

    String event = doc["event"];
    if (event == "phx_reply") {
        Serial.println("Subscription to devices table successful.");
    } else if (event == "postgres_changes") {
        // Handle both UPDATE and INSERT events
        JsonObject data = doc["payload"]["data"]["record"];
        String eventType = doc["payload"]["data"]["eventType"];
        
        int gpio = data["gpio"];
        int state = data["state"];
        const char* deviceName = data["name"];

        if (eventType == "INSERT") {
            Serial.printf("New device added: %s on GPIO %d\n", deviceName, gpio);
            
            // Initialize the new GPIO pin if not already done
            if (!initializedPins[gpio] && gpio >= 0 && gpio <= 39) {
                initializeGPIO(gpio);
                Serial.printf("GPIO %d initialized for new device\n", gpio);
            }
        } else if (eventType == "UPDATE") {
            Serial.printf("Device update - GPIO %d, new state: %d", gpio, state);
            
            // Check if device name was updated (for rename functionality)
            if (deviceName) {
                Serial.printf(", device renamed to: %s", deviceName);
            }
            Serial.println();

            // Update GPIO state
            if (gpio >= 0 && gpio <= 39) {
                // Initialize GPIO if not already done (safety check)
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
    doc["payload"]["config"]["postgres_changes"][0]["table"] = "devices";
    doc["payload"]["config"]["postgres_changes"][0]["filter"] = filter.c_str();

    doc["ref"] = messageRef++;

    String message;
    serializeJson(doc, message);
    webSocket.sendTXT(message);
    Serial.println("Subscribing to devices table for user: " + userId);
}

void handleWebSocketMessage(uint8_t * payload, size_t length) {
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, payload, length);

    String event = doc["event"];
    if (event == "phx_reply") {
        String status = doc["payload"]["status"];
        if (status == "ok") {
            Serial.println("Subscription to devices table successful.");
        } else {
            Serial.println("Subscription failed. Check RLS policies, JWT role, and user ID.");
        }
    } else if (event == "postgres_changes") {
        JsonObject data = doc["payload"]["data"]["record"];
        String eventType = doc["payload"]["data"]["eventType"];

        int gpio = data["gpio"];
        int state = data["state"];
        const char* deviceName = data["name"];

        if (eventType == "INSERT") {
            Serial.printf("New device added: %s on GPIO %d\n", deviceName, gpio);
            if (gpio >= 0 && gpio <= 39) initializeGPIO(gpio);
        } else if (eventType == "UPDATE") {
            Serial.printf("Device update - GPIO %d, new state: %d", gpio, state);
            if (deviceName) Serial.printf(", device name: %s", deviceName);
            Serial.println();
            if (gpio >= 0 && gpio <= 39) {
                if (!initializedPins[gpio]) initializeGPIO(gpio);
                digitalWrite(gpio, state == 1 ? HIGH : LOW);
            } else {
                Serial.printf("Invalid GPIO %d\n", gpio);
            }
        }
    }
}

void initializeGPIO(int gpio) {
    if (gpio >= 0 && gpio <= 39 && !initializedPins[gpio]) {
        pinMode(gpio, OUTPUT);
        digitalWrite(gpio, LOW);
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

